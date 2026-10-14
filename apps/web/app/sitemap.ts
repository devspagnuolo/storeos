import type { MetadataRoute } from 'next';
import { getBrands, getCategories, getCollections, getProducts, siteUrl } from '../lib/api';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, products, brands, collections] = await Promise.all([getCategories(), getProducts({ pageSize: 60 }), getBrands(), getCollections()]);
  return [
    { url: siteUrl, changeFrequency: 'daily', priority: 1 },
    { url: `${siteUrl}/categorias`, changeFrequency: 'daily', priority: 0.8 },
    ...categories.map(c => ({ url: `${siteUrl}/categorias/${c.slug}`, changeFrequency: 'weekly' as const, priority: 0.7 })),
    ...collections.map(c => ({ url: `${siteUrl}/colecoes/${c.slug}`, changeFrequency: 'weekly' as const, priority: 0.7 })),
    ...brands.map(b => ({ url: `${siteUrl}/marcas/${b.slug}`, changeFrequency: 'weekly' as const, priority: 0.5 })),
    ...products.items.map(p => ({ url: `${siteUrl}/produto/${p.slug}`, changeFrequency: 'weekly' as const, priority: 0.6 })),
  ];
}
