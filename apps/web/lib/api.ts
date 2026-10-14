export const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
export const storeSlug = process.env.NEXT_PUBLIC_STORE_SLUG ?? 'demo';
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export type ProductImage = { url: string; alt: string | null };
export type ProductSummary = { id: string; name: string; slug: string; sku: string; price: string; images?: ProductImage[] };
export type ProductDetail = ProductSummary & { description: string | null; available: number; categories: { name: string; slug: string }[]; brand?: { name: string; slug: string } | null; seoTitle?: string | null; seoDescription?: string | null };
export type Brand = { id: string; name: string; slug: string; logoUrl: string | null };
export type Collection = { id: string; name: string; slug: string; description: string | null };
export type Category = { id: string; name: string; slug: string; description: string | null };
export type ProductPage = { items: ProductSummary[]; total: number; page: number; pageSize: number };

const emptyPage = (page = 1, pageSize = 24): ProductPage => ({ items: [], total: 0, page, pageSize });

async function get<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${apiUrl}${path}`, { next: { revalidate: 60 } });
    return response.ok ? await response.json() : fallback;
  } catch {
    // A vitrine continua de pé mesmo com a API fora do ar (por exemplo, acordando no plano free).
    return fallback;
  }
}

export function getProducts(query: { category?: string; brand?: string; collection?: string; q?: string; page?: number; pageSize?: number } = {}) {
  const params = new URLSearchParams({ store: storeSlug });
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, String(value));
  return get<ProductPage>(`/catalog/products?${params}`, emptyPage(query.page, query.pageSize));
}

export const getCategories = () => get<Category[]>(`/catalog/categories?store=${encodeURIComponent(storeSlug)}`, []);

export const getBrands = () => get<Brand[]>(`/catalog/brands?store=${encodeURIComponent(storeSlug)}`, []);
export const getCollections = () => get<Collection[]>(`/catalog/collections?store=${encodeURIComponent(storeSlug)}`, []);

export const getProduct = (slug: string) => get<ProductDetail | null>(`/catalog/products/${encodeURIComponent(slug)}?store=${encodeURIComponent(storeSlug)}`, null);

export type StorefrontConfig = { announcementText?: string; heroTitle?: string; heroDescription?: string; heroCta?: string; heroImageUrl?: string | null; accentColor?: string };
export type StoreInfo = { slug: string; name: string; logoUrl: string | null; faviconUrl: string | null; themeConfig?: StorefrontConfig };

export const getStore = () => get<StoreInfo>(`/store/public/${encodeURIComponent(storeSlug)}`, { slug: storeSlug, name: 'Loja', logoUrl: null, faviconUrl: null, themeConfig: {} });
