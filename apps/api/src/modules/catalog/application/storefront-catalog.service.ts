import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { FacetBucket, ProductDetail, ProductListQuery, ProductListResult, ProductSummary } from '@storeos/contracts';
import { NotFoundError } from '../../../shared/domain/errors';
import { fromCents, toCents } from '../../../shared/domain/money';
import { CacheService } from '../../../shared/infrastructure/cache/cache.service';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { InventoryService } from '../../inventory/application/inventory.service';
import { detailInclude, summaryInclude, toDetail, toSummary } from './catalog.mapper';

@Injectable()
export class StorefrontCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly cache: CacheService,
  ) {}

  async list(storeId: string, q: ProductListQuery): Promise<ProductListResult> {
    const where = await this.buildWhere(storeId, q);
    const orderBy = this.orderBy(q.sort, Boolean(q.q));

    const [total, rows, brandGroups, categoryGroups, priceAgg] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: summaryInclude }),
      this.prisma.product.groupBy({ by: ['brandId'], where: { ...where, brandId: { not: null } }, _count: { _all: true } }),
      this.prisma.productCategory.groupBy({ by: ['categoryId'], where: { product: where }, _count: { _all: true } }),
      this.prisma.product.aggregate({ where, _min: { price: true }, _max: { price: true } }),
    ]);

    const stock = await this.inventory.availability(storeId, rows.flatMap((r) => r.variants.map((v) => v.id)));
    const items: ProductSummary[] = rows.map((p) => toSummary(p, stock));

    const [brands, categories] = await Promise.all([
      this.prisma.brand.findMany({ where: { id: { in: brandGroups.map((b) => b.brandId!).filter(Boolean) } } }),
      this.prisma.category.findMany({ where: { id: { in: categoryGroups.map((c) => c.categoryId) } } }),
    ]);
    const brandFacets: FacetBucket[] = brandGroups
      .map((g) => ({ value: brands.find((b) => b.id === g.brandId)?.slug ?? '', label: brands.find((b) => b.id === g.brandId)?.name ?? '', count: g._count._all }))
      .filter((f) => f.value)
      .sort((a, b) => b.count - a.count);
    const categoryFacets: FacetBucket[] = categoryGroups
      .map((g) => ({ value: categories.find((c) => c.id === g.categoryId)?.slug ?? '', label: categories.find((c) => c.id === g.categoryId)?.name ?? '', count: g._count._all }))
      .filter((f) => f.value)
      .sort((a, b) => b.count - a.count);

    return {
      items,
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      facets: {
        brands: brandFacets,
        categories: categoryFacets,
        priceRange: { minCents: toCents(priceAgg._min.price), maxCents: toCents(priceAgg._max.price) },
      },
    };
  }

  async bySlug(storeId: string, slug: string): Promise<ProductDetail> {
    const product = await this.prisma.product.findFirst({
      where: { storeId, slug, status: 'ACTIVE', deletedAt: null },
      include: detailInclude,
    });
    if (!product) throw new NotFoundError('Produto não encontrado', 'PRODUCT_NOT_FOUND');
    const stock = await this.inventory.availability(storeId, product.variants.map((v) => v.id));
    return toDetail(product, stock);
  }

  async related(storeId: string, slug: string, limit = 8): Promise<ProductSummary[]> {
    const product = await this.prisma.product.findFirst({ where: { storeId, slug, status: 'ACTIVE', deletedAt: null }, include: { categories: true } });
    if (!product) return [];
    const rows = await this.prisma.product.findMany({
      where: {
        storeId,
        status: 'ACTIVE',
        deletedAt: null,
        id: { not: product.id },
        OR: [{ categories: { some: { categoryId: { in: product.categories.map((c) => c.categoryId) } } } }, ...(product.brandId ? [{ brandId: product.brandId }] : [])],
      },
      orderBy: [{ soldCount: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      include: summaryInclude,
    });
    const stock = await this.inventory.availability(storeId, rows.flatMap((r) => r.variants.map((v) => v.id)));
    return rows.map((p) => toSummary(p, stock));
  }

  async byIds(storeId: string, ids: string[]): Promise<ProductSummary[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.product.findMany({ where: { storeId, id: { in: ids.slice(0, 24) }, status: 'ACTIVE', deletedAt: null }, include: summaryInclude });
    const stock = await this.inventory.availability(storeId, rows.flatMap((r) => r.variants.map((v) => v.id)));
    return rows.map((p) => toSummary(p, stock));
  }

  /** Sugestões de busca (autocomplete): produtos, categorias e marcas. */
  async suggest(storeId: string, term: string) {
    const q = term.trim();
    if (q.length < 2) return { products: [], categories: [], brands: [] };
    return this.cache.wrap(`catalog:${storeId}:suggest:${q.toLowerCase()}`, 60, async () => {
      const [products, categories, brands] = await Promise.all([
        this.prisma.product.findMany({
          where: { storeId, status: 'ACTIVE', deletedAt: null, OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }, { tags: { has: q.toLowerCase() } }] },
          take: 6,
          orderBy: { soldCount: 'desc' },
          include: { media: { take: 1, orderBy: { position: 'asc' } } },
        }),
        this.prisma.category.findMany({ where: { storeId, active: true, name: { contains: q, mode: 'insensitive' } }, take: 4 }),
        this.prisma.brand.findMany({ where: { storeId, active: true, name: { contains: q, mode: 'insensitive' } }, take: 4 }),
      ]);
      return {
        products: products.map((p) => ({ id: p.id, slug: p.slug, name: p.name, priceCents: toCents(p.price), imageUrl: p.media[0]?.url ?? null })),
        categories: categories.map((c) => ({ name: c.name, slug: c.slug })),
        brands: brands.map((b) => ({ name: b.name, slug: b.slug })),
      };
    });
  }

  // ── internos ──

  private async buildWhere(storeId: string, q: ProductListQuery): Promise<Prisma.ProductWhereInput> {
    const and: Prisma.ProductWhereInput[] = [];
    if (q.q) {
      const words = q.q.trim().split(/\s+/).filter(Boolean).slice(0, 6);
      for (const word of words) {
        and.push({
          OR: [
            { name: { contains: word, mode: 'insensitive' } },
            { sku: { contains: word, mode: 'insensitive' } },
            { shortDescription: { contains: word, mode: 'insensitive' } },
            { brand: { name: { contains: word, mode: 'insensitive' } } },
            { tags: { has: word.toLowerCase() } },
            { keywords: { has: word.toLowerCase() } },
          ],
        });
      }
    }
    if (q.category) {
      const category = await this.prisma.category.findFirst({ where: { storeId, slug: q.category, active: true } });
      if (!category) return { id: { in: [] } };
      // Inclui produtos de todas as subcategorias (caminho materializado).
      const subtree = await this.prisma.category.findMany({
        where: { storeId, active: true, OR: [{ id: category.id }, { path: { startsWith: `${category.path}/` } }] },
        select: { id: true },
      });
      and.push({ categories: { some: { categoryId: { in: subtree.map((c) => c.id) } } } });
    }
    if (q.brand) and.push({ brand: { slug: q.brand } });
    if (q.collection) and.push({ collections: { some: { collection: { slug: q.collection, active: true } } } });
    if (q.minPriceCents !== undefined) and.push({ price: { gte: fromCents(q.minPriceCents) } });
    if (q.maxPriceCents !== undefined) and.push({ price: { lte: fromCents(q.maxPriceCents) } });
    if (q.onSale) and.push({ compareAtPrice: { not: null } });
    if (q.inStock) {
      const ids = await this.prisma.$queryRaw<{ productId: string }[]>`
        SELECT DISTINCT v."productId"
          FROM "InventoryLevel" l JOIN "ProductVariant" v ON v.id = l."variantId"
         WHERE l."storeId" = ${storeId} AND (l."onHand" - l."reserved") > 0`;
      and.push({ OR: [{ id: { in: ids.map((r) => r.productId) } }, { trackInventory: false }, { allowBackorder: true }] });
    }
    return { storeId, status: 'ACTIVE', deletedAt: null, ...(and.length ? { AND: and } : {}) };
  }

  private orderBy(sort: ProductListQuery['sort'], hasQuery: boolean): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case 'price_asc':
        return [{ price: 'asc' }];
      case 'price_desc':
        return [{ price: 'desc' }];
      case 'best_selling':
        return [{ soldCount: 'desc' }, { createdAt: 'desc' }];
      case 'name_asc':
        return [{ name: 'asc' }];
      case 'relevance':
        return hasQuery ? [{ soldCount: 'desc' }, { ratingAverage: 'desc' }] : [{ soldCount: 'desc' }, { createdAt: 'desc' }];
      default:
        return [{ publishedAt: 'desc' }, { createdAt: 'desc' }];
    }
  }
}
