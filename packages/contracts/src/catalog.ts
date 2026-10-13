import { z } from 'zod';
import { cents, paginationQuery, slugSchema } from './common';

export const productTypeSchema = z.enum(['SIMPLE', 'VARIABLE', 'DIGITAL', 'KIT', 'SUBSCRIPTION']);
export const productStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']);

export const variantInputSchema = z.object({
  sku: z.string().min(1).max(60),
  ean: z.string().max(14).optional(),
  gtin: z.string().max(14).optional(),
  priceCents: cents.optional(),
  compareAtPriceCents: cents.optional(),
  costPriceCents: cents.optional(),
  weightGrams: z.number().int().min(0).optional(),
  attributes: z.record(z.string()).default({}),
  active: z.boolean().default(true),
  initialStock: z.number().int().min(0).default(0),
});
export type VariantInput = z.infer<typeof variantInputSchema>;

export const mediaInputSchema = z.object({
  kind: z.enum(['IMAGE', 'VIDEO', 'FILE']).default('IMAGE'),
  url: z.string().url(),
  alt: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
});

export const createProductSchema = z.object({
  type: productTypeSchema.default('SIMPLE'),
  name: z.string().min(2).max(200),
  slug: slugSchema.optional(),
  sku: z.string().min(1).max(60),
  shortDescription: z.string().max(400).optional(),
  description: z.string().max(20000).optional(),
  brandId: z.string().uuid().optional(),
  categoryIds: z.array(z.string().uuid()).default([]),
  priceCents: cents,
  compareAtPriceCents: cents.optional(),
  costPriceCents: cents.optional(),
  ean: z.string().max(14).optional(),
  gtin: z.string().max(14).optional(),
  ncm: z.string().regex(/^\d{8}$/, 'NCM deve ter 8 dígitos').optional(),
  weightGrams: z.number().int().min(0).default(0),
  lengthMm: z.number().int().min(0).default(0),
  widthMm: z.number().int().min(0).default(0),
  heightMm: z.number().int().min(0).default(0),
  trackInventory: z.boolean().default(true),
  allowBackorder: z.boolean().default(false),
  seoTitle: z.string().max(70).optional(),
  seoDescription: z.string().max(160).optional(),
  keywords: z.array(z.string().max(60)).max(30).default([]),
  tags: z.array(z.string().max(40)).max(30).default([]),
  specs: z.record(z.string()).default({}),
  media: z.array(mediaInputSchema).max(50).default([]),
  variants: z.array(variantInputSchema).max(200).default([]),
  initialStock: z.number().int().min(0).default(0),
  publish: z.boolean().default(false),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema
  .omit({ variants: true, media: true, initialStock: true, publish: true, sku: true })
  .partial()
  .extend({ status: productStatusSchema.optional() });
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productSortSchema = z.enum(['relevance', 'newest', 'price_asc', 'price_desc', 'best_selling', 'name_asc']);

export const productListQuery = paginationQuery.extend({
  q: z.string().max(120).optional(),
  category: z.string().optional(),
  brand: z.string().optional(),
  collection: z.string().optional(),
  minPriceCents: z.coerce.number().int().min(0).optional(),
  maxPriceCents: z.coerce.number().int().min(0).optional(),
  inStock: z.coerce.boolean().optional(),
  onSale: z.coerce.boolean().optional(),
  sort: productSortSchema.default('newest'),
});
export type ProductListQuery = z.infer<typeof productListQuery>;

export const adminProductListQuery = paginationQuery.extend({
  q: z.string().max(120).optional(),
  status: productStatusSchema.optional(),
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
});

export const categoryInputSchema = z.object({
  name: z.string().min(2).max(120),
  slug: slugSchema.optional(),
  parentId: z.string().uuid().nullable().optional(),
  description: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional(),
  seoTitle: z.string().max(70).optional(),
  seoDescription: z.string().max(160).optional(),
  position: z.number().int().default(0),
  active: z.boolean().default(true),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const brandInputSchema = z.object({
  name: z.string().min(2).max(120),
  slug: slugSchema.optional(),
  description: z.string().max(2000).optional(),
  logoUrl: z.string().url().optional(),
  active: z.boolean().default(true),
});

export const collectionInputSchema = z.object({
  name: z.string().min(2).max(120),
  slug: slugSchema.optional(),
  description: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional(),
  productIds: z.array(z.string().uuid()).default([]),
  active: z.boolean().default(true),
});

export const stockAdjustSchema = z.object({
  variantId: z.string().uuid(),
  warehouseId: z.string().uuid().optional(),
  delta: z.number().int().refine((v) => v !== 0, 'delta não pode ser zero'),
  reason: z.string().min(2).max(200),
});

// ── Visões públicas (storefront) ──

export interface MediaView {
  id: string;
  kind: 'IMAGE' | 'VIDEO' | 'FILE';
  url: string;
  alt: string | null;
  position: number;
}

export interface VariantView {
  id: string;
  sku: string;
  attributes: Record<string, string>;
  priceCents: number;
  compareAtPriceCents: number | null;
  available: number;
  inStock: boolean;
}

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  imageUrl: string | null;
  brand: { name: string; slug: string } | null;
  ratingAverage: number;
  ratingCount: number;
  inStock: boolean;
}

export interface ProductDetail extends ProductSummary {
  type: string;
  sku: string;
  shortDescription: string | null;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  keywords: string[];
  specs: Record<string, string>;
  media: MediaView[];
  variants: VariantView[];
  categories: { id: string; name: string; slug: string }[];
  sizeChart: { columns: string[]; rows: string[][] } | null;
  weightGrams: number;
}

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  children: CategoryNode[];
}

export interface FacetBucket {
  value: string;
  label: string;
  count: number;
}
export interface ProductListResult {
  items: ProductSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  facets: { brands: FacetBucket[]; categories: FacetBucket[]; priceRange: { minCents: number; maxCents: number } };
}
