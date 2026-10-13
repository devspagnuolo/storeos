import { Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { createProductSchema } from '@storeos/contracts';
import { ValidationError } from '../../../shared/domain/errors';
import { toCents } from '../../../shared/domain/money';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { ProductAdminService } from './product-admin.service';

export interface ImportRowResult {
  line: number;
  sku: string;
  status: 'created' | 'skipped' | 'error';
  message?: string;
}

const MAX_ROWS = 2000;

/**
 * Importação CSV. Colunas: sku,name,price,compare_at_price,stock,description,short_description,
 * brand,category,ean,ncm,weight_grams,tags,image_url,publish. Preço em reais ("129,90" ou "129.90").
 * Linhas com SKU já existente são ignoradas (importação é somente de criação).
 */
@Injectable()
export class ProductImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductAdminService,
  ) {}

  async importCsv(storeId: string, csv: string, actorId?: string): Promise<{ total: number; created: number; skipped: number; errors: number; rows: ImportRowResult[] }> {
    let records: Record<string, string>[];
    try {
      records = parse(csv, { columns: (h: string[]) => h.map((c) => c.trim().toLowerCase()), skip_empty_lines: true, trim: true, bom: true, relax_column_count: true });
    } catch (err) {
      throw new ValidationError(`CSV inválido: ${(err as Error).message}`, undefined, 'INVALID_CSV');
    }
    if (records.length > MAX_ROWS) throw new ValidationError(`Máximo de ${MAX_ROWS} linhas por importação`, undefined, 'CSV_TOO_LARGE');

    const brandCache = new Map<string, string>();
    const categoryCache = new Map<string, string>();
    const rows: ImportRowResult[] = [];

    for (const [index, rec] of records.entries()) {
      const line = index + 2;
      const sku = (rec.sku ?? '').trim();
      try {
        if (!sku) throw new Error('SKU obrigatório');
        const exists = await this.prisma.product.findFirst({ where: { storeId, sku, deletedAt: null }, select: { id: true } });
        if (exists) {
          rows.push({ line, sku, status: 'skipped', message: 'SKU já cadastrado' });
          continue;
        }
        const brandId = rec.brand ? await this.brandId(storeId, rec.brand, brandCache) : undefined;
        const categoryId = rec.category ? await this.categoryId(storeId, rec.category, categoryCache) : undefined;
        const input = createProductSchema.parse({
          sku,
          name: rec.name,
          priceCents: this.parsePrice(rec.price),
          compareAtPriceCents: rec.compare_at_price ? this.parsePrice(rec.compare_at_price) : undefined,
          description: rec.description || undefined,
          shortDescription: rec.short_description || undefined,
          brandId,
          categoryIds: categoryId ? [categoryId] : [],
          ean: rec.ean || undefined,
          ncm: rec.ncm || undefined,
          weightGrams: rec.weight_grams ? Number(rec.weight_grams) : 0,
          tags: rec.tags ? rec.tags.split('|').map((t) => t.trim().toLowerCase()).filter(Boolean) : [],
          media: rec.image_url ? [{ kind: 'IMAGE', url: rec.image_url, alt: rec.name }] : [],
          initialStock: rec.stock ? Math.max(0, Math.trunc(Number(rec.stock))) : 0,
          publish: ['1', 'true', 'sim', 'yes'].includes((rec.publish ?? '').toLowerCase()),
        });
        await this.products.create(storeId, input, actorId);
        rows.push({ line, sku, status: 'created' });
      } catch (err) {
        const message = err instanceof Error && 'issues' in err ? (err as { issues: { path: (string | number)[]; message: string }[] }).issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') : (err as Error).message;
        rows.push({ line, sku, status: 'error', message });
      }
    }
    return {
      total: rows.length,
      created: rows.filter((r) => r.status === 'created').length,
      skipped: rows.filter((r) => r.status === 'skipped').length,
      errors: rows.filter((r) => r.status === 'error').length,
      rows,
    };
  }

  private parsePrice(raw: string | undefined): number {
    if (!raw) throw new Error('Preço obrigatório');
    let value = raw.replace(/[^\d.,-]/g, '');
    if (value.includes(',') && value.includes('.')) value = value.replace(/\./g, '').replace(',', '.');
    else if (value.includes(',')) value = value.replace(',', '.');
    const cents = toCents(value);
    if (!Number.isFinite(cents) || cents < 0) throw new Error(`Preço inválido: ${raw}`);
    return cents;
  }

  private async brandId(storeId: string, name: string, cache: Map<string, string>): Promise<string> {
    const key = name.toLowerCase();
    const hit = cache.get(key);
    if (hit) return hit;
    const found = await this.prisma.brand.findFirst({ where: { storeId, name: { equals: name, mode: 'insensitive' } } });
    const id = found?.id ?? (await this.createBrand(storeId, name));
    cache.set(key, id);
    return id;
  }

  private async createBrand(storeId: string, name: string): Promise<string> {
    const { slugify } = await import('../../../shared/domain/slug');
    const base = slugify(name) || 'marca';
    const taken = await this.prisma.brand.count({ where: { storeId, slug: { startsWith: base } } });
    const brand = await this.prisma.brand.create({ data: { storeId, name, slug: taken ? `${base}-${taken + 1}` : base } });
    return brand.id;
  }

  /** Aceita "Moda > Camisetas" criando a hierarquia quando necessário. */
  private async categoryId(storeId: string, pathLabel: string, cache: Map<string, string>): Promise<string> {
    const { slugify } = await import('../../../shared/domain/slug');
    const parts = pathLabel.split('>').map((p) => p.trim()).filter(Boolean);
    let parent: { id: string; path: string; depth: number } | null = null;
    for (const part of parts) {
      const key = `${parent?.id ?? 'root'}:${part.toLowerCase()}`;
      const cached = cache.get(key);
      if (cached) {
        parent = await this.prisma.category.findUniqueOrThrow({ where: { id: cached }, select: { id: true, path: true, depth: true } });
        continue;
      }
      const found: { id: string; path: string; depth: number } | null = await this.prisma.category.findFirst({
        where: { storeId, parentId: parent?.id ?? null, name: { equals: part, mode: 'insensitive' } },
        select: { id: true, path: true, depth: true },
      });
      if (found) {
        cache.set(key, found.id);
        parent = found;
        continue;
      }
      const base = slugify(part) || 'categoria';
      const taken = await this.prisma.category.count({ where: { storeId, slug: { startsWith: base } } });
      const slug = taken ? `${base}-${taken + 1}` : base;
      const created: { id: string; path: string; depth: number } = await this.prisma.category.create({
        data: { storeId, name: part, slug, parentId: parent?.id, path: parent ? `${parent.path}/${slug}` : slug, depth: parent ? parent.depth + 1 : 0 },
        select: { id: true, path: true, depth: true },
      });
      cache.set(key, created.id);
      parent = created;
    }
    return parent!.id;
  }
}
