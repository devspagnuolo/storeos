import { Injectable } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { ISSUE_LABEL, MarketingConfig, parseMarketingConfig, productIssues, readMarketingConfig, SeoIssue } from './seo-rules';

@Injectable()
export class SeoService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(storeId: string): Promise<MarketingConfig> {
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { marketingConfig: true } });
    return readMarketingConfig(store.marketingConfig);
  }

  async saveConfig(storeId: string, input: Record<string, unknown>) {
    const config = parseMarketingConfig(input);
    await this.prisma.store.update({ where: { id: storeId }, data: { marketingConfig: config } });
    return config;
  }

  /** Confere o que faz a loja aparecer bem no Google: ajustes da loja e a qualidade das páginas de produto. */
  async audit(storeId: string) {
    const [config, products, domain] = await Promise.all([
      this.getConfig(storeId),
      this.prisma.product.findMany({ where: { storeId, status: ProductStatus.ACTIVE }, select: { id: true, name: true, slug: true, description: true, seoTitle: true, seoDescription: true, images: { select: { alt: true } } }, orderBy: { name: 'asc' }, take: 5000 }),
      this.prisma.storeDomain.findFirst({ where: { storeId, status: 'ACTIVE' }, select: { hostname: true } }),
    ]);
    const counts: Record<SeoIssue, number> = { 'no-photo': 0, 'no-description': 0, 'short-description': 0, 'no-seo-description': 0, 'no-alt': 0, 'no-seo-title': 0 };
    const withIssues: { id: string; name: string; slug: string; issues: SeoIssue[] }[] = [];
    for (const p of products) {
      const issues = productIssues(p);
      for (const i of issues) counts[i] += 1;
      if (issues.length) withIssues.push({ id: p.id, name: p.name, slug: p.slug, issues });
    }
    // Pendências que mais atrapalham vêm primeiro.
    const weight = (issues: SeoIssue[]) => issues.reduce((n, i) => n + (i === 'no-photo' || i === 'no-description' ? 3 : i === 'no-seo-title' ? 1 : 2), 0);
    withIssues.sort((a, b) => weight(b.issues) - weight(a.issues));
    return {
      checks: [
        { id: 'domain', label: 'Domínio próprio ativo', ok: Boolean(domain), hint: 'Anúncios e Google funcionam melhor no seu endereço (www.sualoja.com.br). Configure em Domínios.' },
        { id: 'home', label: 'Título e descrição da página inicial', ok: Boolean(config.homeTitle && config.homeDescription), hint: 'Aparecem no Google quando alguém busca o nome da loja. Preencha abaixo.' },
        { id: 'analytics', label: 'Google Analytics ou Tag Manager', ok: Boolean(config.ga4 || config.gtm), hint: 'Sem isso você não vê visitas nem de onde elas vêm.' },
        { id: 'pixel', label: 'Pixel do Meta (Instagram e Facebook)', ok: Boolean(config.metaPixel), hint: 'Necessário para anunciar no Instagram e Facebook medindo vendas.' },
        { id: 'search-console', label: 'Google Search Console verificado', ok: Boolean(config.googleVerification), hint: 'Mostra com quais buscas a loja aparece e avisa de erros. Cole o código de verificação abaixo.' },
      ],
      products: { total: products.length, withIssues: withIssues.length, counts: (Object.keys(counts) as SeoIssue[]).map(key => ({ key, label: ISSUE_LABEL[key], count: counts[key] })) },
      list: withIssues.slice(0, 50).map(p => ({ ...p, labels: p.issues.map(i => ISSUE_LABEL[i]) })),
    };
  }
}
