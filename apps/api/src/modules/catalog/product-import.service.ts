import { BadRequestException, Injectable } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { toCsv } from '../inventory/stock-ledger';
import { CatalogService } from './catalog.service';
import { ImportError, ImportProduct, parseProducts, slugify } from './product-csv';

export interface ImportReport { dryRun: boolean; rows: number; created: number; updated: number; failed: number; errors: ImportError[]; products: { slug: string; name: string; action: 'create' | 'update' | 'error'; variants: number }[] }

@Injectable()
export class ProductImportService {
  constructor(private readonly prisma: PrismaService, private readonly catalog: CatalogService) {}

  /** Importa produtos de uma planilha. Cada produto é independente: um erro não derruba os demais. `dryRun` só confere e conta. */
  async importCsv(storeId: string, csv: string, dryRun: boolean): Promise<ImportReport> {
    if (typeof csv !== 'string' || !csv.trim()) throw new BadRequestException('Envie a planilha CSV no corpo da requisição (Content-Type: text/csv)');
    const parsed = parseProducts(csv);
    const report: ImportReport = { dryRun, rows: parsed.rows, created: 0, updated: 0, failed: parsed.errors.length, errors: [...parsed.errors], products: [] };
    const existing = new Map((await this.prisma.product.findMany({ where: { storeId, slug: { in: parsed.products.map(p => p.slug) } }, select: { id: true, slug: true } })).map(p => [p.slug, p.id]));
    for (const product of parsed.products) {
      const id = existing.get(product.slug);
      try {
        if (!dryRun) await this.save(storeId, product, id);
        report[id ? 'updated' : 'created']++;
        report.products.push({ slug: product.slug, name: product.name, action: id ? 'update' : 'create', variants: product.variants.length });
      } catch (error) {
        report.failed++;
        report.errors.push({ line: product.line, message: `${product.name}: ${error instanceof Error ? error.message : 'erro inesperado'}` });
        report.products.push({ slug: product.slug, name: product.name, action: 'error', variants: product.variants.length });
      }
    }
    return report;
  }

  /** Cria (ou reaproveita, pelo nome dentro do mesmo pai) cada nível do caminho "Blusas > Manga Longa > Renda". */
  private async categoryIds(storeId: string, paths: string[][]) {
    const ids = new Set<string>();
    for (const path of paths) {
      let parentId: string | null = null;
      for (const name of path) {
        parentId = await this.findOrCreateCategory(storeId, name, parentId);
        ids.add(parentId);
      }
    }
    return [...ids];
  }

  private async findOrCreateCategory(storeId: string, name: string, parentId: string | null) {
    const found = await this.prisma.category.findFirst({ where: { storeId, parentId, name: { equals: name, mode: 'insensitive' } } });
    if (found) return found.id;
    return (await this.catalog.createCategory(storeId, { name: name.slice(0, 80), slug: slugify(name) || 'categoria', parentId })).id;
  }

  private async brandId(storeId: string, name?: string) {
    if (!name) return undefined;
    const slug = slugify(name) || 'marca';
    return (await this.prisma.brand.findFirst({ where: { storeId, slug } }))?.id ?? (await this.catalog.createBrand(storeId, { name, slug })).id;
  }

  /** `preserveCommercial`: ao atualizar produto existente, mantém preço, situação, estoque e variações como estão na loja. */
  async save(storeId: string, p: ImportProduct, existingId?: string, opts: { preserveCommercial?: boolean } = {}) {
    const categoryIds = await this.categoryIds(storeId, p.categories);
    const brandId = await this.brandId(storeId, p.brand);
    const keep = Boolean(existingId && opts.preserveCommercial);
    const common = {
      name: p.name, sku: p.sku, ...(p.description && { description: p.description }),
      ...(categoryIds.length && { categoryIds }), ...(brandId && { brandId }), ...(p.seoTitle && { seoTitle: p.seoTitle }), ...(p.seoDescription && { seoDescription: p.seoDescription }),
      ...(p.weightGrams && { weightGrams: p.weightGrams }), ...(p.widthCm && { widthCm: p.widthCm }), ...(p.heightCm && { heightCm: p.heightCm }), ...(p.lengthCm && { lengthCm: p.lengthCm }),
      ...(p.ncm && { ncm: p.ncm }), ...(p.cest && { cest: p.cest }), ...(p.gtin && { gtin: p.gtin }), ...(p.taxOrigin !== undefined && { taxOrigin: p.taxOrigin }), ...(p.unit && { unit: p.unit }),
    };
    const commercial = { price: p.price, status: p.status === 'ACTIVE' ? ProductStatus.ACTIVE : ProductStatus.DRAFT };
    let productId = existingId;
    if (existingId) {
      await this.catalog.update(storeId, existingId, { ...common, ...(keep ? {} : commercial), ...(p.variants.length || keep ? {} : { stock: p.stock }) });
    } else {
      productId = (await this.catalog.create(storeId, { ...common, ...commercial, slug: p.slug, stock: p.stock, ...(p.imageUrls[0] && { imageUrl: p.imageUrls[0] }) })).id;
    }
    const id = productId as string;
    if (!(await this.prisma.productImage.count({ where: { productId: id } })) || (!existingId && p.imageUrls.length > 1)) {
      const have = await this.prisma.productImage.count({ where: { productId: id } });
      const urls = p.imageUrls.slice(have);
      if (urls.length) await this.prisma.productImage.createMany({ data: urls.map((url, i) => ({ productId: id, url, alt: p.name, position: have + i })) });
    }
    if (p.variants.length && !keep) {
      const current = await this.prisma.productVariant.findMany({ where: { productId: id }, select: { id: true, sku: true } });
      await this.catalog.replaceVariants(storeId, id, p.variants.map(v => ({ id: current.find(c => c.sku.toLowerCase() === v.sku.toLowerCase())?.id, sku: v.sku, attributes: v.attributes, price: v.price, stock: v.stock, ...(v.gtin && { gtin: v.gtin }) })));
    }
  }

  /** Exporta o catálogo no mesmo formato que o importador lê (uma linha por variação). */
  async exportCsv(storeId: string) {
    const products = await this.prisma.product.findMany({
      where: { storeId, status: { not: ProductStatus.ARCHIVED } }, orderBy: { name: 'asc' }, take: 5000,
      include: { categories: { include: { category: true } }, brand: true, images: { orderBy: { position: 'asc' } }, inventory: true, variants: { orderBy: { position: 'asc' } } },
    });
    const all = await this.prisma.category.findMany({ where: { storeId }, select: { id: true, name: true, parentId: true } });
    const pathOf = (id: string): string => { const c = all.find(x => x.id === id); return c ? (c.parentId ? `${pathOf(c.parentId)} > ${c.name}` : c.name) : ''; };
    const header = ['Identificador URL', 'Nome', 'Categorias', 'Nome da variação 1', 'Valor da variação 1', 'Nome da variação 2', 'Valor da variação 2', 'Nome da variação 3', 'Valor da variação 3', 'Preço', 'Peso (kg)', 'Altura (cm)', 'Largura (cm)', 'Comprimento (cm)', 'Estoque', 'SKU', 'Exibir na loja', 'Descrição', 'Marca', 'Imagens'];
    const rows: (string | number)[][] = [header];
    for (const p of products) {
      const categories = p.categories.map(({ category: c }) => pathOf(c.id)).join(', ');
      const base = [p.slug, p.name, categories];
      const info = [p.status === ProductStatus.ACTIVE ? 'SIM' : 'NÃO', p.description ?? '', p.brand?.name ?? '', p.images.map(i => i.url).join(' ')];
      const dims = [p.weightGrams ? p.weightGrams / 1000 : '', p.heightCm ?? '', p.widthCm ?? '', p.lengthCm ?? ''];
      if (!p.variants.length) {
        rows.push([...base, '', '', '', '', '', '', p.price.toString(), ...dims, p.inventory.find(i => !i.variantId)?.quantity ?? 0, p.sku, ...info]);
        continue;
      }
      p.variants.forEach((v, index) => {
        const attrs = (v.attributes as { name: string; value: string }[]).slice(0, 3);
        const cells = [0, 1, 2].flatMap(n => [attrs[n]?.name ?? '', attrs[n]?.value ?? '']);
        const stock = p.inventory.find(i => i.variantId === v.id)?.quantity ?? 0;
        rows.push(index === 0
          ? [...base, ...cells, (v.price ?? p.price).toString(), ...dims, stock, v.sku, ...info]
          : [p.slug, '', '', ...cells, (v.price ?? p.price).toString(), '', '', '', '', stock, v.sku, '', '', '', '']);
      });
    }
    return toCsv(rows);
  }
}
