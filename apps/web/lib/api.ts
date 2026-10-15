import { buildTree, TreeNode } from './category-tree';

import { apiUrl, defaultStoreSlug } from './config';
import { resolveStoreSlug } from './store-host';

export { apiUrl };

export type ProductImage = { url: string; alt: string | null };
export type ProductSummary = { id: string; name: string; slug: string; sku: string; price: string; images?: ProductImage[] };
export type ProductVariant = { id: string; sku: string; price: string | null; attributes: { name: string; value: string }[]; available: number };
export type ProductDetail = ProductSummary & { description: string | null; available: number; variants?: ProductVariant[]; categories: { name: string; slug: string }[]; brand?: { name: string; slug: string } | null; seoTitle?: string | null; seoDescription?: string | null };
export type Brand = { id: string; name: string; slug: string; logoUrl: string | null };
export type Collection = { id: string; name: string; slug: string; description: string | null };
export type Category = { id: string; name: string; slug: string; description: string | null; parentId: string | null; position?: number; bannerUrl?: string | null; bannerMobileUrl?: string | null };
export type ProductPage = { items: ProductSummary[]; total: number; page: number; pageSize: number };

const emptyPage = (page = 1, pageSize = 24): ProductPage => ({ items: [], total: 0, page, pageSize });

async function get<T>(path: (slug: string) => string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${apiUrl}${path(await resolveStoreSlug())}`, { next: { revalidate: 60 } });
    return response.ok ? await response.json() : fallback;
  } catch {
    // A vitrine continua de pé mesmo com a API fora do ar (por exemplo, acordando no plano free).
    return fallback;
  }
}

export function getProducts(query: { ids?: string; category?: string; brand?: string; collection?: string; q?: string; page?: number; pageSize?: number } = {}) {
  return get<ProductPage>(store => {
    const params = new URLSearchParams({ store });
    for (const [key, value] of Object.entries(query)) if (value) params.set(key, String(value));
    return `/catalog/products?${params}`;
  }, emptyPage(query.page, query.pageSize));
}

export const getCategories = () => get<Category[]>(store => `/catalog/categories?store=${encodeURIComponent(store)}`, []);

export const getBrands = () => get<Brand[]>(store => `/catalog/brands?store=${encodeURIComponent(store)}`, []);
export const getCollections = () => get<Collection[]>(store => `/catalog/collections?store=${encodeURIComponent(store)}`, []);

export const getProduct = (slug: string) => get<ProductDetail | null>(store => `/catalog/products/${encodeURIComponent(slug)}?store=${encodeURIComponent(store)}`, null);

export type PageLink = { slug: string; title: string; showInFooter: boolean };
export type ContentPage = { slug: string; title: string; body: string; seoDescription: string | null; updatedAt: string };

export type SectionType = 'banners' | 'hero' | 'image' | 'carousel' | 'text' | 'categories' | 'products' | 'benefits' | 'testimonials' | 'newsletter' | 'video';
/** Valores de seção já validados pela API (texto, número, listas); a tela trata cada campo conforme o catálogo. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;
export type SectionProps = Record<string, Json>;
export type HomeSection = { id: string; type: SectionType; hidden: boolean; props: SectionProps };
export type StorefrontDesign = { preset?: string; font?: string; buttonRadius?: string; containerWidth?: string; spacing?: string; logoUrl?: string | null; faviconUrl?: string | null; backgroundColor?: string; textColor?: string };
export type StorefrontConfig = { announcementText?: string; heroTitle?: string; heroDescription?: string; heroCta?: string; heroImageUrl?: string | null; accentColor?: string; design?: StorefrontDesign; home?: { sections: HomeSection[] } };
export type StoreMarketing = { ga4?: string; gtm?: string; metaPixel?: string; googleVerification?: string; homeTitle?: string; homeDescription?: string };
export type StoreInfo = { slug: string; name: string; open?: boolean; logoUrl: string | null; faviconUrl: string | null; themeConfig?: StorefrontConfig; whatsappNumber?: string | null; whatsappMessage?: string | null; marketing?: StoreMarketing };

export const getStore = () => get<StoreInfo>(store => `/store/public/${encodeURIComponent(store)}`, { slug: defaultStoreSlug, name: 'Loja', logoUrl: null, faviconUrl: null, themeConfig: {} });

export const getPages = () => get<PageLink[]>(store => `/content/pages?store=${encodeURIComponent(store)}`, []);
export const getPage = (slug: string) => get<ContentPage | null>(store => `/content/pages/${encodeURIComponent(slug)}?store=${encodeURIComponent(store)}`, null);

export type MenuLink = { label: string; href: string; children: MenuLink[] };
export type StorefrontMenu = { configured: boolean; items: MenuLink[] };
export const getMenu = (key: 'main' | 'footer') => get<StorefrontMenu>(store => `/content/menus/${key}?store=${encodeURIComponent(store)}`, { configured: false, items: [] });
/** Menu padrão enquanto a loja não montou o próprio: a árvore de categorias (até 4 níveis) vira o menu. */
export function defaultMenu(categories: Category[]): MenuLink[] {
  const link = (node: TreeNode<Category>): MenuLink => ({ label: node.name, href: `/categorias/${node.slug}`, children: node.children.map(link) });
  return buildTree(categories).map(link);
}

export type BannerSlide = { id: string; imageUrl: string; mobileImageUrl: string | null; title: string | null; subtitle: string | null; ctaLabel: string | null; linkUrl: string | null };
export const getBanners = () => get<BannerSlide[]>(store => `/engagement/banners?store=${encodeURIComponent(store)}`, []);

export type ReviewSummary = { count: number; average: number; distribution: Record<1 | 2 | 3 | 4 | 5, number> };
export type PublicReview = { id: string; author: string; rating: number; title: string | null; body: string; reply: string | null; createdAt: string; verified: boolean };
export type ProductReviews = { summary: ReviewSummary; items: PublicReview[] };
const noReviews: ProductReviews = { summary: { count: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }, items: [] };

export const getReviews = (productSlug: string) => get<ProductReviews>(store => `/reviews/public?store=${encodeURIComponent(store)}&product=${encodeURIComponent(productSlug)}`, noReviews);
