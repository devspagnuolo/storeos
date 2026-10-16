import type { MetadataRoute } from 'next';
import { getBrands, getCategories, getCollections, getPages, getPosts, getProducts } from '../lib/api';
import { resolveSiteUrl } from '../lib/store-host';

export const dynamic = 'force-dynamic';

/** Todas as páginas de produto, não só as primeiras: o limite da API é 60 por página. */
async function allProducts() {
  const first = await getProducts({ pageSize: 60 });
  const pages = Math.min(Math.ceil(first.total / 60), 80);
  const rest = await Promise.all(Array.from({ length: Math.max(pages - 1, 0) }, (_, i) => getProducts({ pageSize: 60, page: i + 2 })));
  return { items: [first, ...rest].flatMap(p => p.items) };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = await resolveSiteUrl();
  const [categories, products, brands, collections, pages] = await Promise.all([getCategories(), allProducts(), getBrands(), getCollections(), getPages()]);
  const posts = await getPosts({ limit: 48 });
  return [
    { url: siteUrl, changeFrequency: 'daily', priority: 1 },
    { url: `${siteUrl}/categorias`, changeFrequency: 'daily', priority: 0.8 },
    ...categories.map(c => ({ url: `${siteUrl}/categorias/${c.slug}`, changeFrequency: 'weekly' as const, priority: 0.7 })),
    ...collections.map(c => ({ url: `${siteUrl}/colecoes/${c.slug}`, changeFrequency: 'weekly' as const, priority: 0.7 })),
    ...brands.map(b => ({ url: `${siteUrl}/marcas/${b.slug}`, changeFrequency: 'weekly' as const, priority: 0.5 })),
    ...pages.map(p => ({ url: `${siteUrl}/p/${p.slug}`, changeFrequency: 'monthly' as const, priority: 0.4 })),
    ...(posts.items.length ? [{ url: `${siteUrl}/blog`, changeFrequency: 'weekly' as const, priority: 0.5 }] : []),
    ...posts.items.map(p => ({ url: `${siteUrl}/blog/${p.slug}`, changeFrequency: 'monthly' as const, priority: 0.5 })),
    ...products.items.map(p => ({ url: `${siteUrl}/produto/${p.slug}`, changeFrequency: 'weekly' as const, priority: 0.6 })),
  ];
}
