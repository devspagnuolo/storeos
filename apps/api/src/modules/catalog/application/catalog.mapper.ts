import type { MediaView, ProductDetail, ProductSummary, VariantView } from '@storeos/contracts';
import { Prisma } from '@prisma/client';
import { toCents } from '../../../shared/domain/money';

export const summaryInclude = {
  brand: true,
  media: { orderBy: { position: 'asc' as const }, take: 1 },
  variants: { where: { active: true }, select: { id: true } },
} satisfies Prisma.ProductInclude;

export const detailInclude = {
  brand: true,
  media: { orderBy: { position: 'asc' as const } },
  variants: { where: { active: true }, orderBy: { position: 'asc' as const } },
  categories: { include: { category: true } },
  sizeChart: true,
} satisfies Prisma.ProductInclude;

export type SummaryRow = Prisma.ProductGetPayload<{ include: typeof summaryInclude }>;
export type DetailRow = Prisma.ProductGetPayload<{ include: typeof detailInclude }>;

export function toSummary(p: SummaryRow, stock: Map<string, number>): ProductSummary {
  const inStock = !p.trackInventory || p.allowBackorder || p.variants.some((v) => (stock.get(v.id) ?? 0) > 0);
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    priceCents: toCents(p.price),
    compareAtPriceCents: p.compareAtPrice ? toCents(p.compareAtPrice) : null,
    imageUrl: p.media[0]?.url ?? null,
    brand: p.brand ? { name: p.brand.name, slug: p.brand.slug } : null,
    ratingAverage: Number(p.ratingAverage),
    ratingCount: p.ratingCount,
    inStock,
  };
}

export function toDetail(p: DetailRow, stock: Map<string, number>): ProductDetail {
  const unlimited = !p.trackInventory || p.allowBackorder;
  const variants: VariantView[] = p.variants.map((v) => {
    const available = unlimited ? 9999 : (stock.get(v.id) ?? 0);
    return {
      id: v.id,
      sku: v.sku,
      attributes: (v.attributes ?? {}) as Record<string, string>,
      priceCents: toCents(v.price ?? p.price),
      compareAtPriceCents: v.compareAtPrice ? toCents(v.compareAtPrice) : p.compareAtPrice ? toCents(p.compareAtPrice) : null,
      available,
      inStock: available > 0,
    };
  });
  const media: MediaView[] = p.media.map((m) => ({ id: m.id, kind: m.kind, url: m.url, alt: m.alt, position: m.position }));
  const chart = p.sizeChart ? { columns: p.sizeChart.columns as string[], rows: p.sizeChart.rows as string[][] } : null;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    type: p.type,
    sku: p.sku,
    priceCents: toCents(p.price),
    compareAtPriceCents: p.compareAtPrice ? toCents(p.compareAtPrice) : null,
    imageUrl: media[0]?.url ?? null,
    brand: p.brand ? { name: p.brand.name, slug: p.brand.slug } : null,
    ratingAverage: Number(p.ratingAverage),
    ratingCount: p.ratingCount,
    inStock: variants.some((v) => v.inStock),
    shortDescription: p.shortDescription,
    description: p.description,
    seoTitle: p.seoTitle ?? p.name,
    seoDescription: p.seoDescription ?? p.shortDescription,
    keywords: p.keywords,
    specs: (p.specs ?? {}) as Record<string, string>,
    media,
    variants,
    categories: p.categories.map((c) => ({ id: c.category.id, name: c.category.name, slug: c.category.slug })),
    sizeChart: chart,
    weightGrams: p.weightGrams,
  };
}
