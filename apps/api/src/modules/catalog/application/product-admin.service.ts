import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateProductInput, EventNames, UpdateProductInput, VariantInput } from '@storeos/contracts';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../../shared/domain/errors';
import { fromCents, toCents } from '../../../shared/domain/money';
import { paginate, skipTake } from '../../../shared/domain/pagination';
import { AuditService } from '../../../shared/infrastructure/audit/audit.service';
import { CacheService } from '../../../shared/infrastructure/cache/cache.service';
import { OutboxService } from '../../../shared/infrastructure/outbox/outbox.service';
import { PrismaService, Tx } from '../../../shared/infrastructure/prisma/prisma.service';
import { InventoryService } from '../../inventory/application/inventory.service';
import { SlugService } from './slug.service';

const money = (cents?: number | null) => (cents === undefined || cents === null ? undefined : fromCents(cents));

@Injectable()
export class ProductAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slugs: SlugService,
    private readonly inventory: InventoryService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
  ) {}

  async list(storeId: string, q: { page: number; pageSize: number; q?: string; status?: string; categoryId?: string; brandId?: string }) {
    const where: Prisma.ProductWhereInput = {
      storeId,
      deletedAt: null,
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.brandId ? { brandId: q.brandId } : {}),
      ...(q.categoryId ? { categories: { some: { categoryId: q.categoryId } } } : {}),
      ...(q.q
        ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { sku: { contains: q.q, mode: 'insensitive' } }, { variants: { some: { sku: { contains: q.q, mode: 'insensitive' } } } }] }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        ...skipTake(q.page, q.pageSize),
        include: { brand: true, media: { take: 1, orderBy: { position: 'asc' } }, variants: { select: { id: true } } },
      }),
    ]);
    const stock = await this.inventory.availability(storeId, rows.flatMap((r) => r.variants.map((v) => v.id)));
    const items = rows.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      sku: p.sku,
      status: p.status,
      type: p.type,
      priceCents: toCents(p.price),
      imageUrl: p.media[0]?.url ?? null,
      brand: p.brand?.name ?? null,
      stock: p.variants.reduce((sum, v) => sum + (stock.get(v.id) ?? 0), 0),
      updatedAt: p.updatedAt.toISOString(),
    }));
    return paginate(items, total, q.page, q.pageSize);
  }

  async get(storeId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, storeId, deletedAt: null },
      include: { brand: true, media: { orderBy: { position: 'asc' } }, variants: { orderBy: { position: 'asc' } }, categories: true, sizeChart: true },
    });
    if (!product) throw new NotFoundError('Produto não encontrado', 'PRODUCT_NOT_FOUND');
    const stock = await this.inventory.availability(storeId, product.variants.map((v) => v.id));
    return { ...product, variants: product.variants.map((v) => ({ ...v, available: stock.get(v.id) ?? 0 })) };
  }

  async create(storeId: string, input: CreateProductInput, actorId?: string) {
    await this.assertRefs(storeId, input.brandId, input.categoryIds);
    const product = await this.prisma.runInTransaction(async (tx) => {
      const slug = await this.slugs.unique('product', storeId, input.slug ?? input.name, undefined, tx);
      const variants: VariantInput[] = input.variants.length
        ? input.variants
        : [{ sku: input.sku, priceCents: undefined, attributes: {}, active: true, initialStock: input.initialStock } as VariantInput];
      if (input.type === 'VARIABLE' && input.variants.length === 0) {
        throw new BusinessRuleError('Produto variável exige ao menos uma variação', 'VARIANTS_REQUIRED');
      }
      this.assertUniqueSkus(input.sku, variants);

      let created;
      try {
        created = await tx.product.create({
          data: {
            storeId,
            type: input.type,
            name: input.name,
            slug,
            sku: input.sku,
            shortDescription: input.shortDescription,
            description: input.description,
            brandId: input.brandId,
            price: fromCents(input.priceCents),
            compareAtPrice: money(input.compareAtPriceCents),
            costPrice: money(input.costPriceCents),
            ean: input.ean,
            gtin: input.gtin,
            ncm: input.ncm,
            weightGrams: input.weightGrams,
            lengthMm: input.lengthMm,
            widthMm: input.widthMm,
            heightMm: input.heightMm,
            trackInventory: input.trackInventory,
            allowBackorder: input.allowBackorder,
            seoTitle: input.seoTitle,
            seoDescription: input.seoDescription,
            keywords: input.keywords,
            tags: input.tags,
            specs: input.specs,
            status: input.publish ? 'ACTIVE' : 'DRAFT',
            publishedAt: input.publish ? new Date() : null,
            categories: { create: input.categoryIds.map((categoryId, i) => ({ categoryId, isPrimary: i === 0 })) },
            media: { create: input.media.map((m, i) => ({ kind: m.kind, url: m.url, alt: m.alt, title: m.title, position: i, isCover: i === 0 })) },
            variants: {
              create: variants.map((v, i) => ({
                sku: v.sku,
                ean: v.ean,
                gtin: v.gtin,
                price: money(v.priceCents),
                compareAtPrice: money(v.compareAtPriceCents),
                costPrice: money(v.costPriceCents),
                weightGrams: v.weightGrams,
                attributes: v.attributes,
                active: v.active,
                position: i,
                isDefault: i === 0,
              })),
            },
          },
          include: { variants: true },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictError('SKU ou URL já existem nesta loja', 'PRODUCT_DUPLICATE');
        }
        throw err;
      }

      for (const [index, variant] of created.variants.entries()) {
        const initial = variants[index]?.initialStock ?? 0;
        if (initial > 0 && input.trackInventory) {
          await this.inventory.adjust(storeId, { variantId: variant.id, delta: initial, reason: 'Estoque inicial', type: 'RECEIPT' }, actorId, tx);
        }
      }
      await this.outbox.enqueue(tx, {
        storeId,
        aggregateType: 'Product',
        aggregateId: created.id,
        eventName: input.publish ? EventNames.PRODUCT_PUBLISHED : EventNames.PRODUCT_CREATED,
        payload: { productId: created.id, sku: created.sku, slug: created.slug },
      });
      return created;
    });
    await this.afterChange(storeId, product.id, 'catalog.product-created', actorId);
    return this.get(storeId, product.id);
  }

  async update(storeId: string, id: string, input: UpdateProductInput, actorId?: string) {
    const current = await this.prisma.product.findFirst({ where: { id, storeId, deletedAt: null } });
    if (!current) throw new NotFoundError('Produto não encontrado', 'PRODUCT_NOT_FOUND');
    await this.assertRefs(storeId, input.brandId, input.categoryIds);

    await this.prisma.runInTransaction(async (tx) => {
      const slug = input.slug && input.slug !== current.slug ? await this.slugs.unique('product', storeId, input.slug, id, tx) : undefined;
      const becamePublished = input.status === 'ACTIVE' && current.status !== 'ACTIVE';
      await tx.product.update({
        where: { id },
        data: {
          type: input.type,
          name: input.name,
          slug,
          shortDescription: input.shortDescription,
          description: input.description,
          brandId: input.brandId,
          price: input.priceCents === undefined ? undefined : fromCents(input.priceCents),
          compareAtPrice: money(input.compareAtPriceCents),
          costPrice: money(input.costPriceCents),
          ean: input.ean,
          gtin: input.gtin,
          ncm: input.ncm,
          weightGrams: input.weightGrams,
          lengthMm: input.lengthMm,
          widthMm: input.widthMm,
          heightMm: input.heightMm,
          trackInventory: input.trackInventory,
          allowBackorder: input.allowBackorder,
          seoTitle: input.seoTitle,
          seoDescription: input.seoDescription,
          keywords: input.keywords,
          tags: input.tags,
          specs: input.specs,
          status: input.status,
          publishedAt: becamePublished ? new Date() : undefined,
        },
      });
      if (input.categoryIds) {
        await tx.productCategory.deleteMany({ where: { productId: id } });
        await tx.productCategory.createMany({ data: input.categoryIds.map((categoryId, i) => ({ productId: id, categoryId, isPrimary: i === 0 })) });
      }
      await this.outbox.enqueue(tx, {
        storeId,
        aggregateType: 'Product',
        aggregateId: id,
        eventName: becamePublished ? EventNames.PRODUCT_PUBLISHED : EventNames.PRODUCT_UPDATED,
        payload: { productId: id, sku: current.sku, slug: slug ?? current.slug },
      });
    });
    await this.afterChange(storeId, id, 'catalog.product-updated', actorId, { before: { status: current.status, name: current.name }, after: input });
    return this.get(storeId, id);
  }

  async remove(storeId: string, id: string, actorId?: string): Promise<void> {
    const product = await this.prisma.product.findFirst({ where: { id, storeId, deletedAt: null } });
    if (!product) throw new NotFoundError('Produto não encontrado', 'PRODUCT_NOT_FOUND');
    await this.prisma.runInTransaction(async (tx) => {
      // Exclusão lógica preserva o histórico de pedidos (snapshot em OrderItem).
      await tx.product.update({ where: { id }, data: { deletedAt: new Date(), status: 'ARCHIVED', slug: `${product.slug}--deleted-${Date.now().toString(36)}`, sku: `${product.sku}--deleted-${Date.now().toString(36)}` } });
      await this.outbox.enqueue(tx, { storeId, aggregateType: 'Product', aggregateId: id, eventName: EventNames.PRODUCT_DELETED, payload: { productId: id, sku: product.sku, slug: product.slug } });
    });
    await this.afterChange(storeId, id, 'catalog.product-deleted', actorId);
  }

  async addVariant(storeId: string, productId: string, input: VariantInput, actorId?: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, storeId, deletedAt: null } });
    if (!product) throw new NotFoundError('Produto não encontrado', 'PRODUCT_NOT_FOUND');
    const variant = await this.prisma.runInTransaction(async (tx) => {
      const count = await tx.productVariant.count({ where: { productId } });
      let created;
      try {
        created = await tx.productVariant.create({
          data: {
            productId,
            sku: input.sku,
            ean: input.ean,
            gtin: input.gtin,
            price: money(input.priceCents),
            compareAtPrice: money(input.compareAtPriceCents),
            costPrice: money(input.costPriceCents),
            weightGrams: input.weightGrams,
            attributes: input.attributes,
            active: input.active,
            position: count,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ConflictError('SKU já existe neste produto', 'VARIANT_DUPLICATE');
        throw err;
      }
      if (input.initialStock > 0) {
        await this.inventory.adjust(storeId, { variantId: created.id, delta: input.initialStock, reason: 'Estoque inicial', type: 'RECEIPT' }, actorId, tx);
      }
      return created;
    });
    await this.afterChange(storeId, productId, 'catalog.variant-added', actorId);
    return variant;
  }

  async addMedia(storeId: string, productId: string, media: { kind: 'IMAGE' | 'VIDEO' | 'FILE'; url: string; alt?: string; title?: string; storageKey?: string; mimeType?: string; sizeBytes?: number }) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, storeId, deletedAt: null } });
    if (!product) throw new NotFoundError('Produto não encontrado', 'PRODUCT_NOT_FOUND');
    const position = await this.prisma.productMedia.count({ where: { productId } });
    const created = await this.prisma.productMedia.create({ data: { productId, ...media, position, isCover: position === 0 } });
    await this.cache.delByPrefix(`catalog:${storeId}:`);
    return created;
  }

  async removeMedia(storeId: string, productId: string, mediaId: string): Promise<void> {
    const found = await this.prisma.productMedia.findFirst({ where: { id: mediaId, productId, product: { storeId } } });
    if (!found) throw new NotFoundError('Mídia não encontrada');
    await this.prisma.productMedia.delete({ where: { id: mediaId } });
    await this.cache.delByPrefix(`catalog:${storeId}:`);
  }

  private assertUniqueSkus(productSku: string, variants: VariantInput[]): void {
    const seen = new Set<string>();
    for (const v of variants) {
      if (seen.has(v.sku)) throw new BusinessRuleError(`SKU de variação duplicado: ${v.sku}`, 'VARIANT_DUPLICATE');
      seen.add(v.sku);
    }
    if (variants.length === 1 && variants[0].sku !== productSku) return;
  }

  private async assertRefs(storeId: string, brandId?: string, categoryIds?: string[]): Promise<void> {
    if (brandId) {
      const brand = await this.prisma.brand.findFirst({ where: { id: brandId, storeId } });
      if (!brand) throw new NotFoundError('Marca não encontrada', 'BRAND_NOT_FOUND');
    }
    if (categoryIds?.length) {
      const count = await this.prisma.category.count({ where: { storeId, id: { in: categoryIds } } });
      if (count !== new Set(categoryIds).size) throw new NotFoundError('Categoria não encontrada', 'CATEGORY_NOT_FOUND');
    }
  }

  private async afterChange(storeId: string, productId: string, action: string, actorId?: string, diff?: { before?: unknown; after?: unknown }): Promise<void> {
    await this.cache.delByPrefix(`catalog:${storeId}:`);
    await this.audit.record({ storeId, action, entityType: 'Product', entityId: productId, actorId, actorType: actorId ? 'USER' : 'SYSTEM', ...diff });
  }
}

export type { Tx };
