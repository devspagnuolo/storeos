import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { buildFeedItems, buildGoogleXml, buildMetaCsv, FEED_ISSUE_LABEL, FeedProduct, feedIssues } from './product-feed';

@Injectable()
export class ProductFeedService {
  constructor(private readonly prisma: PrismaService) {}

  /** Endereço público da loja: domínio próprio ativo, senão o endereço padrão configurado. */
  async siteUrl(storeId: string): Promise<string | null> {
    const domain = await this.prisma.storeDomain.findFirst({ where: { storeId, status: 'ACTIVE' }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] });
    if (domain) return `https://${domain.hostname}`;
    const fallback = process.env.PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
    return fallback ? fallback.replace(/\/$/, '') : null;
  }

  private async load(storeId: string): Promise<FeedProduct[]> {
    const rows = await this.prisma.product.findMany({
      where: { storeId, status: ProductStatus.ACTIVE },
      orderBy: { name: 'asc' }, take: 5000,
      include: {
        brand: { select: { name: true } }, images: { orderBy: { position: 'asc' }, select: { url: true } },
        variants: { where: { active: true }, orderBy: { position: 'asc' } }, inventory: true,
        categories: { include: { category: { select: { name: true } } }, take: 1 },
      },
    });
    const free = (rows: { quantity: number; reserved: number }[]) => rows.reduce((sum, i) => sum + Math.max(i.quantity - i.reserved, 0), 0);
    return rows.map(p => ({
      id: p.id, name: p.name, slug: p.slug, sku: p.sku, description: p.description, price: p.price.toString(), gtin: p.gtin,
      brand: p.brand?.name ?? null, category: p.categories[0]?.category.name ?? null, images: p.images.map(i => i.url),
      available: free(p.inventory.filter(i => !i.variantId)),
      variants: p.variants.map(v => ({
        sku: v.sku, price: v.price?.toString() ?? null, gtin: v.gtin,
        attributes: Array.isArray(v.attributes) ? (v.attributes as { name: string; value: string }[]) : [],
        available: free(p.inventory.filter(i => i.variantId === v.id)),
      })),
    }));
  }

  private async context(storeSlug: string) {
    const store = await this.prisma.store.findUnique({ where: { slug: storeSlug }, select: { id: true, name: true } });
    if (!store) throw new NotFoundException('Loja não encontrada');
    const site = await this.siteUrl(store.id);
    if (!site) throw new ServiceUnavailableException('Endereço da loja não configurado (PUBLIC_SITE_URL ou domínio ativo).');
    return { store, site, items: buildFeedItems(await this.load(store.id), site) };
  }

  async googleXml(storeSlug: string) {
    const { store, site, items } = await this.context(storeSlug);
    return buildGoogleXml(items, { name: store.name, site });
  }

  async metaCsv(storeSlug: string) {
    return buildMetaCsv((await this.context(storeSlug)).items);
  }

  /** Endereços para colar no Google Merchant Center e no Meta, e o que ainda falta nos produtos. */
  async status(storeId: string) {
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { slug: true } });
    const [site, products] = await Promise.all([this.siteUrl(storeId), this.load(storeId)]);
    const counts: Record<string, number> = {};
    const list: { id: string; name: string; labels: string[] }[] = [];
    for (const p of products) {
      const issues = feedIssues(p);
      for (const issue of issues) counts[issue] = (counts[issue] ?? 0) + 1;
      if (issues.length) list.push({ id: p.id, name: p.name, labels: issues.map(i => FEED_ISSUE_LABEL[i]) });
    }
    const api = (process.env.API_PUBLIC_URL ?? '').replace(/\/$/, '');
    const q = `store=${encodeURIComponent(store.slug)}`;
    return {
      siteConfigured: Boolean(site),
      apiConfigured: Boolean(api),
      google: api ? `${api}/api/v1/feeds/google.xml?${q}` : `/api/v1/feeds/google.xml?${q}`,
      meta: api ? `${api}/api/v1/feeds/meta.csv?${q}` : `/api/v1/feeds/meta.csv?${q}`,
      products: products.length,
      withoutPhoto: counts['no-photo'] ?? 0,
      counts: Object.entries(counts).map(([key, count]) => ({ key, label: FEED_ISSUE_LABEL[key as keyof typeof FEED_ISSUE_LABEL], count })),
      list: list.slice(0, 50),
    };
  }
}
