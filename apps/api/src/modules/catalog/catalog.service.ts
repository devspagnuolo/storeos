import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus, StockMovementType } from '@prisma/client';
import { attributeWhere, buildFacets, parseAttributeFilters, priceWhere } from './product-filters';
import { descendantIds, parentProblem } from './category-tree';
import { recordMovement } from '../inventory/stock-ledger';
import { cleanFiscal } from './fiscal-rules';
import { PrismaService } from '../../shared/infrastructure/prisma.service';

export type ProductQuery = { ids?: string; category?: string; brand?: string; collection?: string; q?: string; page?: number; pageSize?: number; attrs?: string; minPrice?: number; maxPrice?: number };
export type CreateProductInput = { name: string; slug: string; sku: string; price: number; description?: string; categoryIds?: string[]; status?: ProductStatus; stock?: number; imageUrl?: string; imageUrls?: string[]; brandId?: string | null; seoTitle?: string; seoDescription?: string; weightGrams?: number | null; widthCm?: number | null; heightCm?: number | null; lengthCm?: number | null; ncm?: string | null; cest?: string | null; gtin?: string | null; taxOrigin?: number | null; unit?: string | null };
export type UpdateProductInput = Partial<Omit<CreateProductInput, 'sku'>> & { sku?: string };
export type CreateBrandInput = { name: string; slug: string; logoUrl?: string };
export type CollectionInput = { name?: string; slug?: string; description?: string; active?: boolean; position?: number; skus?: string[] };
/** Galeria na ordem enviada, sem repetidas; `imageUrl` sozinho continua valendo como foto principal. */
const gallery = (imageUrl?: string, imageUrls?: string[]) => [...new Set(imageUrls?.length ? imageUrls : imageUrl ? [imageUrl] : [])];

/** Banners de categoria só aceitam endereços http(s); string vazia remove a imagem. */
function assertImageUrls(dto: { bannerUrl?: string | null; bannerMobileUrl?: string | null }) {
  for (const key of ['bannerUrl', 'bannerMobileUrl'] as const) {
    const value = dto[key]?.trim();
    if (value && !/^https?:\/\/\S+$/.test(value)) throw new BadRequestException('A imagem deve ser um endereço http(s) válido');
    if (value !== undefined) dto[key] = value || null;
  }
}

export type CreateCategoryInput = { name: string; slug: string; description?: string; position?: number; parentId?: string | null; bannerUrl?: string | null; bannerMobileUrl?: string | null };
export type VariantInput = { id?: string; gtin?: string | null; sku: string; attributes: { name: string; value: string }[]; price?: number | null; stock: number; active?: boolean };
export type UpdateCategoryInput = Partial<CreateCategoryInput>;

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  private async storeId(slug: string) {
    const store = await this.prisma.store.findUnique({ where: { slug }, select: { id: true } });
    return store?.id;
  }

  async listPublic(storeSlug: string, query: ProductQuery = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 24;
    const storeId = await this.storeId(storeSlug);
    if (!storeId) return { items: [], total: 0, page, pageSize };
    // Vitrine com produtos escolhidos a dedo: só entram os ativos da loja, na ordem escolhida.
    const ids = query.ids?.split(',').map(id => id.trim()).filter(Boolean).slice(0, 24);
    const filters = [attributeWhere(parseAttributeFilters(query.attrs)), priceWhere(query.minPrice, query.maxPrice)].filter(Boolean) as Prisma.ProductWhereInput[];
    const where: Prisma.ProductWhereInput = { ...(await this.scopeWhere(storeId, query)), ...(ids && { id: { in: ids } }), ...(filters.length && { AND: filters }) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, include: { images: { orderBy: { position: 'asc' }, take: 1 } }, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.product.count({ where }),
    ]);
    if (ids) items.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    return { items, total, page, pageSize };
  }

  /**
   * Sugestões para o carrinho, nesta ordem: o que outras clientes levaram junto nos pedidos pagos,
   * produtos das mesmas categorias, os mais vendidos e as novidades. Só produtos à venda e com saldo; nunca repete o carrinho.
   */
  async recommendations(storeSlug: string, productIds: string[], limit = 8) {
    const storeId = await this.storeId(storeSlug);
    if (!storeId) return { items: [] };
    const ids = [...new Set(productIds)].slice(0, 50);
    const sold = Prisma.sql`o.status::text IN ('PAID', 'PICKING', 'INVOICED', 'SHIPPED', 'DELIVERED')`;
    const [together, bestSellers, links] = await Promise.all([
      ids.length ? this.prisma.$queryRaw<{ productId: string }[]>`
        SELECT other."productId" AS "productId", COUNT(DISTINCT other."orderId") AS orders
        FROM "OrderItem" mine
        JOIN "OrderItem" other ON other."orderId" = mine."orderId" AND other."productId" IS NOT NULL AND other."productId" <> ALL(${ids})
        JOIN "Order" o ON o.id = mine."orderId"
        WHERE o."storeId" = ${storeId} AND ${sold} AND mine."productId" = ANY(${ids})
        GROUP BY other."productId" ORDER BY orders DESC LIMIT 40` : [],
      this.prisma.$queryRaw<{ productId: string }[]>`
        SELECT i."productId" AS "productId", SUM(i.quantity) AS units
        FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId"
        WHERE o."storeId" = ${storeId} AND ${sold} AND i."productId" IS NOT NULL AND o."createdAt" > NOW() - INTERVAL '90 days'
        GROUP BY i."productId" ORDER BY units DESC LIMIT 40`,
      ids.length ? this.prisma.productCategory.findMany({ where: { productId: { in: ids }, product: { storeId } }, select: { categoryId: true } }) : [],
    ]);
    const categoryIds = [...new Set(links.map(link => link.categoryId))];
    const base: Prisma.ProductWhereInput = { storeId, status: ProductStatus.ACTIVE, id: { notIn: ids } };
    const include = { images: { orderBy: { position: 'asc' as const }, take: 1 }, inventory: { select: { quantity: true, reserved: true } } };
    const ranked = [...together, ...bestSellers].map(row => row.productId);
    const [rankedProducts, related, newest] = await Promise.all([
      ranked.length ? this.prisma.product.findMany({ where: { ...base, id: { in: ranked, notIn: ids } }, include }) : [],
      categoryIds.length ? this.prisma.product.findMany({ where: { ...base, categories: { some: { categoryId: { in: categoryIds } } } }, include, orderBy: { createdAt: 'desc' }, take: 40 }) : [],
      this.prisma.product.findMany({ where: base, include, orderBy: { createdAt: 'desc' }, take: 40 }),
    ]);
    const byId = new Map(rankedProducts.map(product => [product.id, product]));
    const boughtTogether = new Set(together.map(row => row.productId));
    const togetherList = together.map(row => byId.get(row.productId)).filter(Boolean) as typeof rankedProducts;
    const bestList = bestSellers.map(row => byId.get(row.productId)).filter(Boolean) as typeof rankedProducts;
    const seen = new Set<string>();
    const items = [...togetherList, ...related, ...bestList, ...newest]
      .filter(product => !seen.has(product.id) && seen.add(product.id) && product.inventory.some(i => i.quantity - i.reserved > 0))
      .slice(0, Math.min(Math.max(limit, 1), 12))
      .map(({ inventory: _inventory, ...product }) => ({ ...product, boughtTogether: boughtTogether.has(product.id) }));
    return { items };
  }

  /** Produtos ativos da lista (categoria com subcategorias, marca, coleção, busca), antes dos filtros de tamanho, cor e preço. */
  private async scopeWhere(storeId: string, query: ProductQuery): Promise<Prisma.ProductWhereInput> {
    const q = query.q?.trim();
    // Abrir uma categoria mostra também os produtos de todas as subcategorias abaixo dela.
    const categoryIds = query.category ? await this.categoryAndDescendants(storeId, query.category) : undefined;
    return {
      storeId,
      status: ProductStatus.ACTIVE,
      ...(categoryIds && { categories: { some: { categoryId: { in: categoryIds } } } }),
      ...(query.brand && { brand: { slug: query.brand } }),
      ...(query.collection && { collections: { some: { collection: { slug: query.collection, active: true } } } }),
      ...(q && { OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }, { sku: { equals: q, mode: 'insensitive' } }] }),
    };
  }

  /** Opções de filtro (tamanhos, cores, faixa de preço) dos produtos da lista atual. */
  async facets(storeSlug: string, query: ProductQuery = {}) {
    const storeId = await this.storeId(storeSlug);
    if (!storeId) return buildFacets([]);
    const products = await this.prisma.product.findMany({
      where: await this.scopeWhere(storeId, query),
      // Só opções que dá para comprar: variação ativa e com estoque, igual ao filtro.
      select: { price: true, variants: { where: { active: true, inventory: { some: { quantity: { gt: 0 } } } }, select: { attributes: true, price: true } } },
      take: 2000,
    });
    return buildFacets(products);
  }

  /** Para cada linha do carrinho: se o produto (ou variação) ainda está à venda, o saldo livre e o preço vigente. */
  async availability(storeSlug: string, items: { productId: string; variantId?: string }[]) {
    const storeId = await this.storeId(storeSlug);
    const products = storeId && items.length ? await this.prisma.product.findMany({
      where: { storeId, id: { in: [...new Set(items.map(i => i.productId))] } },
      select: { id: true, status: true, price: true, variants: { where: { active: true }, select: { id: true, price: true } }, inventory: { select: { variantId: true, quantity: true, reserved: true } } },
    }) : [];
    return items.map(({ productId, variantId }) => {
      const product = products.find(p => p.id === productId);
      const variant = variantId ? product?.variants.find(v => v.id === variantId) : undefined;
      // Produto com variações só vende pela variação; sem variações, só a linha do produto vale.
      const sellable = product && product.status === ProductStatus.ACTIVE && (variantId ? Boolean(variant) : product.variants.length === 0);
      if (!sellable) return { productId, variantId: variantId ?? null, active: false, available: 0, price: null };
      const available = product.inventory.filter(i => (variantId ? i.variantId === variantId : !i.variantId)).reduce((sum, i) => sum + Math.max(i.quantity - i.reserved, 0), 0);
      return { productId, variantId: variantId ?? null, active: true, available, price: (variant?.price ?? product.price).toFixed(2) };
    });
  }

  async bySlug(storeSlug: string, slug: string) {
    const storeId = await this.storeId(storeSlug);
    const product = storeId && await this.prisma.product.findFirst({
      where: { storeId, slug, status: ProductStatus.ACTIVE },
      include: { brand: { select: { name: true, slug: true } }, images: { orderBy: { position: 'asc' } }, variants: { where: { active: true }, orderBy: { position: 'asc' } }, inventory: true, categories: { include: { category: { select: { name: true, slug: true } } } } },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');
    const { inventory, categories, variants, ...rest } = product;
    const free = (rows: typeof inventory) => rows.reduce((sum, i) => sum + Math.max(i.quantity - i.reserved, 0), 0);
    // Com variações, o saldo vive em cada uma; sem elas, no produto.
    const withStock = variants.map(v => ({ ...v, available: free(inventory.filter(i => i.variantId === v.id)) }));
    const available = variants.length ? free(inventory.filter(i => i.variantId && variants.some(v => v.id === i.variantId))) : free(inventory.filter(i => !i.variantId));
    return { ...rest, variants: withStock, available, categories: categories.map(c => c.category) };
  }

  private async categoryAndDescendants(storeId: string, slug: string) {
    const nodes = await this.prisma.category.findMany({ where: { storeId }, select: { id: true, parentId: true, slug: true } });
    const found = nodes.find(n => n.slug === slug);
    return found ? descendantIds(nodes, found.id) : [];
  }

  async categories(storeSlug: string) {
    const storeId = await this.storeId(storeSlug);
    if (!storeId) return [];
    return this.prisma.category.findMany({ where: { storeId }, orderBy: [{ position: 'asc' }, { name: 'asc' }], select: { id: true, name: true, slug: true, description: true, parentId: true, position: true, bannerUrl: true, bannerMobileUrl: true } });
  }

  /** Até quatro níveis (Blusas > Manga Longa > Renda > ...): cobre catálogos de moda sem virar um labirinto de menus. */
  private async assertParent(storeId: string, parentId: string | null | undefined, selfId?: string) {
    if (!parentId) return;
    const nodes = await this.prisma.category.findMany({ where: { storeId }, select: { id: true, parentId: true } });
    const problem = parentProblem(nodes, parentId, selfId);
    if (problem) throw new BadRequestException(problem);
  }

  /** Se a URL já existe e a categoria tem pai, tenta de novo com o pai na frente ("alfaiataria" vira "conjuntos-alfaiataria"). */
  async createCategory(storeId: string, dto: CreateCategoryInput) {
    assertImageUrls(dto);
    await this.assertParent(storeId, dto.parentId);
    // Sem ordem informada, a nova categoria vai para o fim do mesmo nível (a ordem de criação vira a ordem do menu).
    if (dto.position === undefined) {
      const last = await this.prisma.category.aggregate({ where: { storeId, parentId: dto.parentId ?? null }, _max: { position: true } });
      dto = { ...dto, position: (last._max.position ?? -1) + 1 };
    }
    try {
      return await this.prisma.category.create({ data: { ...dto, storeId } });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const parent = dto.parentId ? await this.prisma.category.findFirst({ where: { id: dto.parentId, storeId } }) : null;
      if (!parent) throw new ConflictException('Já existe uma categoria com essa URL nesta loja');
      try {
        return await this.prisma.category.create({ data: { ...dto, slug: `${parent.slug}-${dto.slug}`.slice(0, 120), storeId } });
      } catch (retry) {
        if (isUniqueViolation(retry)) throw new ConflictException('Já existe uma categoria com essa URL nesta loja');
        throw retry;
      }
    }
  }

  async updateCategory(storeId: string, id: string, dto: UpdateCategoryInput) {
    assertImageUrls(dto);
    if (!(await this.prisma.category.findFirst({ where: { id, storeId } }))) throw new NotFoundException('Categoria não encontrada');
    if (dto.parentId !== undefined) await this.assertParent(storeId, dto.parentId, id);
    try {
      return await this.prisma.category.update({ where: { id }, data: dto });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Já existe uma categoria com essa URL nesta loja');
      throw error;
    }
  }

  /** As subcategorias sobem um nível (para o pai da excluída) e os produtos só perdem o vínculo com esta categoria. */
  async deleteCategory(storeId: string, id: string) {
    const category = await this.prisma.category.findFirst({ where: { id, storeId } });
    if (!category) throw new NotFoundException('Categoria não encontrada');
    await this.prisma.$transaction([
      this.prisma.category.updateMany({ where: { storeId, parentId: id }, data: { parentId: category.parentId } }),
      this.prisma.category.delete({ where: { id } }),
    ]);
  }

  private async assertBrand(storeId: string, brandId?: string | null) {
    if (brandId && !await this.prisma.brand.count({ where: { storeId, id: brandId } })) throw new BadRequestException('Marca inválida');
  }

  brands(storeSlug: string) {
    return this.storeId(storeSlug).then(storeId => storeId ? this.prisma.brand.findMany({ where: { storeId }, orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, logoUrl: true } }) : []);
  }

  async createBrand(storeId: string, dto: CreateBrandInput) {
    try {
      return await this.prisma.brand.create({ data: { ...dto, storeId } });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Já existe uma marca com essa URL nesta loja');
      throw error;
    }
  }

  async collections(storeSlug: string) {
    const storeId = await this.storeId(storeSlug);
    if (!storeId) return [];
    return this.prisma.collection.findMany({ where: { storeId, active: true }, orderBy: [{ position: 'asc' }, { name: 'asc' }], select: { id: true, name: true, slug: true, description: true } });
  }

  async adminCollections(storeId: string) {
    const rows = await this.prisma.collection.findMany({ where: { storeId }, orderBy: [{ position: 'asc' }, { name: 'asc' }], include: { products: { include: { product: { select: { sku: true } } }, orderBy: { position: 'asc' } } } });
    return rows.map(({ products, ...c }) => ({ ...c, skus: products.map(p => p.product.sku) }));
  }

  /** SKUs desconhecidos são recusados em vez de ignorados, para o lojista perceber um erro de digitação. */
  private async productsBySkus(storeId: string, skus: string[]) {
    const unique = [...new Set(skus.map(sku => sku.trim()).filter(Boolean))];
    const found = await this.prisma.product.findMany({ where: { storeId, sku: { in: unique } }, select: { id: true, sku: true } });
    const missing = unique.filter(sku => !found.some(p => p.sku === sku));
    if (missing.length) throw new BadRequestException(`SKU não encontrado: ${missing.slice(0, 5).join(', ')}`);
    return unique.map(sku => found.find(p => p.sku === sku)!.id);
  }

  async createCollection(storeId: string, { skus = [], ...dto }: CollectionInput & { name: string; slug: string }) {
    const productIds = await this.productsBySkus(storeId, skus);
    try {
      return await this.prisma.collection.create({ data: { ...dto, storeId, products: { create: productIds.map((productId, position) => ({ productId, position })) } } });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Já existe uma coleção com essa URL nesta loja');
      throw error;
    }
  }

  async updateCollection(storeId: string, id: string, { skus, ...dto }: CollectionInput) {
    if (!await this.prisma.collection.count({ where: { id, storeId } })) throw new NotFoundException('Coleção não encontrada');
    const productIds = skus && await this.productsBySkus(storeId, skus);
    try {
      return await this.prisma.$transaction(async tx => {
        const updated = await tx.collection.update({ where: { id }, data: dto });
        if (productIds) {
          await tx.collectionProduct.deleteMany({ where: { collectionId: id } });
          await tx.collectionProduct.createMany({ data: productIds.map((productId, position) => ({ collectionId: id, productId, position })) });
        }
        return updated;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Já existe uma coleção com essa URL nesta loja');
      throw error;
    }
  }

  private fiscal<T extends { ncm?: string | null; cest?: string | null; gtin?: string | null; unit?: string | null }>(dto: T): T {
    try { return cleanFiscal(dto); } catch (error) { throw new BadRequestException((error as Error).message); }
  }

  private async assertCategories(storeId: string, categoryIds: string[]) {
    const unique = [...new Set(categoryIds)];
    const count = unique.length ? await this.prisma.category.count({ where: { storeId, id: { in: unique } } }) : 0;
    if (count !== unique.length) throw new BadRequestException('Categoria inválida');
    return unique;
  }

  async create(storeId: string, { categoryIds = [], stock = 0, imageUrl, imageUrls, status = ProductStatus.DRAFT, ...raw }: CreateProductInput) {
    const dto = this.fiscal(raw);
    const categories = await this.assertCategories(storeId, categoryIds);
    await this.assertBrand(storeId, dto.brandId);
    try {
      return await this.prisma.$transaction(async tx => {
        const product = await tx.product.create({ data: { ...dto, storeId, status, categories: { create: categories.map(categoryId => ({ categoryId })) }, ...(gallery(imageUrl, imageUrls).length && { images: { create: gallery(imageUrl, imageUrls).map((url, position) => ({ url, alt: dto.name, position })) } }) } });
        await tx.inventory.create({ data: { storeId, productId: product.id, quantity: stock } });
        await recordMovement(tx, { storeId, productId: product.id, type: StockMovementType.INITIAL, delta: stock, reason: 'Cadastro do produto' });
        await tx.outboxEvent.create({ data: { storeId, aggregateType: 'Product', aggregateId: product.id, eventName: 'catalog.product-created.v1', payload: { sku: product.sku } } });
        return product;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('SKU ou URL já existem nesta loja');
      throw error;
    }
  }

  /** Atualiza dados, status, categorias, imagem principal e saldo físico (o reservado não muda aqui). */
  async update(storeId: string, id: string, { categoryIds, stock, imageUrl, imageUrls, ...raw }: UpdateProductInput) {
    const dto = this.fiscal(raw);
    const existing = await this.prisma.product.findFirst({ where: { id, storeId }, include: { inventory: true, _count: { select: { variants: true } } } });
    if (!existing) throw new NotFoundException('Produto não encontrado');
    const categories = categoryIds && await this.assertCategories(storeId, categoryIds);
    await this.assertBrand(storeId, dto.brandId);
    const inventory = existing.inventory.find(i => !i.variantId);
    // Com variações, o saldo é de cada uma e o campo único é ignorado.
    if (existing._count.variants) stock = undefined;
    if (stock !== undefined && inventory && stock < inventory.reserved) throw new BadRequestException(`O estoque não pode ficar abaixo das ${inventory.reserved} unidades reservadas em pedidos pendentes`);
    try {
      return await this.prisma.$transaction(async tx => {
        const product = await tx.product.update({ where: { id }, data: dto });
        if (categories) {
          await tx.productCategory.deleteMany({ where: { productId: id } });
          await tx.productCategory.createMany({ data: categories.map(categoryId => ({ productId: id, categoryId })) });
        }
        if (stock !== undefined) {
          if (inventory) await tx.inventory.update({ where: { id: inventory.id }, data: { quantity: stock } });
          else await tx.inventory.create({ data: { storeId, productId: id, quantity: stock } });
          await recordMovement(tx, { storeId, productId: id, type: StockMovementType.ADJUSTMENT, delta: stock - (inventory?.quantity ?? 0), reason: 'Edição do produto' });
        }
        if (imageUrls !== undefined) {
          await tx.productImage.deleteMany({ where: { productId: id } });
          await tx.productImage.createMany({ data: [...new Set(imageUrls)].map((url, position) => ({ productId: id, url, alt: product.name, position })) });
        } else if (imageUrl !== undefined) {
          const main = await tx.productImage.findFirst({ where: { productId: id }, orderBy: { position: 'asc' } });
          if (!imageUrl) { if (main) await tx.productImage.delete({ where: { id: main.id } }); }
          else if (main) await tx.productImage.update({ where: { id: main.id }, data: { url: imageUrl } });
          else await tx.productImage.create({ data: { productId: id, url: imageUrl, alt: product.name } });
        }
        if (dto.status === ProductStatus.ACTIVE && existing.status !== ProductStatus.ACTIVE) {
          await tx.outboxEvent.create({ data: { storeId, aggregateType: 'Product', aggregateId: id, eventName: 'catalog.product-published.v1', payload: { sku: product.sku } } });
        }
        return product;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('SKU ou URL já existem nesta loja');
      throw error;
    }
  }

  async adminList(storeId: string, { ids, q, status, category, page = 1, pageSize = 20 }: { ids?: string; q?: string; status?: ProductStatus; category?: string; page?: number; pageSize?: number }) {
    const term = q?.trim();
    // Filtrar por uma categoria inclui as subcategorias dela.
    const categoryIds = category ? await this.categoryAndDescendants(storeId, category) : undefined;
    const idList = ids?.split(',').map(id => id.trim()).filter(Boolean).slice(0, 24);
    const where: Prisma.ProductWhereInput = { storeId, ...(idList && { id: { in: idList } }), ...(categoryIds && { categories: { some: { categoryId: { in: categoryIds } } } }), ...(status && { status }), ...(term && { OR: [{ name: { contains: term, mode: 'insensitive' } }, { sku: { contains: term, mode: 'insensitive' } }] }) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, include: { images: { orderBy: { position: 'asc' }, take: 1 }, inventory: true, _count: { select: { variants: true } } }, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.product.count({ where }),
    ]);
    // Produto com variações mostra a soma dos saldos delas.
    return { items: items.map(({ inventory, _count, ...p }) => { const rows = _count.variants ? inventory.filter(i => i.variantId) : inventory.filter(i => !i.variantId); return { ...p, variantCount: _count.variants, stock: rows.reduce((s, i) => s + i.quantity, 0), reserved: rows.reduce((s, i) => s + i.reserved, 0) }; }), total, page, pageSize };
  }

  async adminGet(storeId: string, id: string) {
    const product = await this.prisma.product.findFirst({ where: { id, storeId }, include: { images: { orderBy: { position: 'asc' } }, inventory: true, categories: true, variants: { orderBy: { position: 'asc' } } } });
    if (!product) throw new NotFoundException('Produto não encontrado');
    const { inventory, categories, variants, ...rest } = product;
    const base = inventory.find(i => !i.variantId);
    return {
      ...rest, stock: base?.quantity ?? 0, reserved: base?.reserved ?? 0, categoryIds: categories.map(c => c.categoryId),
      variants: variants.map(v => { const row = inventory.find(i => i.variantId === v.id); return { ...v, stock: row?.quantity ?? 0, reserved: row?.reserved ?? 0 }; }),
    };
  }

  /**
   * Substitui as variações do produto (cor, tamanho…). Quem tem `id` é atualizado, quem não tem é criado e o que faltar é removido,
   * desde que não tenha unidades reservadas. Com variações o saldo passa a ser de cada uma; sem elas, volta a ser do produto.
   */
  async replaceVariants(storeId: string, productId: string, input: VariantInput[]) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, storeId }, include: { variants: { include: { inventory: true } }, inventory: { where: { variantId: null } } } });
    if (!product) throw new NotFoundException('Produto não encontrado');
    const skus = input.map(v => v.sku.trim());
    if (input.some(v => !v.attributes.length)) throw new BadRequestException('Cada variação precisa de ao menos um atributo (por exemplo, Cor)');
    const names = input.map(v => v.attributes.map(a => a.name.trim().toLowerCase()).join('|'));
    if (new Set(names).size > 1) throw new BadRequestException('Todas as variações devem usar os mesmos atributos, na mesma ordem');
    if (new Set(skus).size !== skus.length) throw new BadRequestException('Há SKUs repetidos nas variações');
    const combos = input.map(v => JSON.stringify(v.attributes.map(a => [a.name.trim().toLowerCase(), a.value.trim().toLowerCase()])));
    if (new Set(combos).size !== combos.length) throw new BadRequestException('Há combinações repetidas nas variações');
    const keep = new Set(input.filter(v => v.id).map(v => v.id));
    for (const id of keep) if (!product.variants.some(v => v.id === id)) throw new BadRequestException('Variação inválida');
    for (const variant of product.variants) {
      const reserved = variant.inventory.reduce((sum, row) => sum + row.reserved, 0);
      if (!keep.has(variant.id) && reserved > 0) throw new BadRequestException(`A variação ${variant.sku} tem ${reserved} unidades reservadas e não pode ser removida agora`);
    }
    for (const entry of input) {
      const row = entry.id ? product.variants.find(v => v.id === entry.id)?.inventory[0] : undefined;
      if (row && entry.stock < row.reserved) throw new BadRequestException(`O estoque de ${entry.sku} não pode ficar abaixo das ${row.reserved} unidades reservadas`);
    }
    try {
      await this.prisma.$transaction(async tx => {
        await tx.productVariant.deleteMany({ where: { productId, id: { notIn: [...keep] as string[] } } });
        for (const [position, entry] of input.entries()) {
          const data = { sku: entry.sku.trim(), attributes: entry.attributes.map(a => ({ name: a.name.trim(), value: a.value.trim() })) as Prisma.InputJsonArray, price: entry.price ?? null, active: entry.active ?? true, position, ...(entry.gtin !== undefined && { gtin: entry.gtin }) };
          const variant = entry.id ? await tx.productVariant.update({ where: { id: entry.id }, data }) : await tx.productVariant.create({ data: { ...data, productId } });
          const row = await tx.inventory.findFirst({ where: { storeId, productId, variantId: variant.id } });
          if (row) await tx.inventory.update({ where: { id: row.id }, data: { quantity: entry.stock } });
          else await tx.inventory.create({ data: { storeId, productId, variantId: variant.id, quantity: entry.stock } });
          await recordMovement(tx, { storeId, productId, variantId: variant.id, type: row ? StockMovementType.ADJUSTMENT : StockMovementType.INITIAL, delta: entry.stock - (row?.quantity ?? 0), reason: 'Edição das variações' });
        }
        // O saldo do produto só existe enquanto ele não tem variações.
        if (input.length) await tx.inventory.deleteMany({ where: { storeId, productId, variantId: null } });
        else if (!product.inventory.length) await tx.inventory.create({ data: { storeId, productId, quantity: 0 } });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Já existe uma variação com esse SKU neste produto');
      throw error;
    }
    return this.adminGet(storeId, productId);
  }
}
