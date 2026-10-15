import type { MetadataRoute } from 'next';
import { resolveSiteUrl } from '../lib/store-host';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const siteUrl = await resolveSiteUrl();
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/checkout', '/carrinho', '/conta', '/acompanhar'] },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
