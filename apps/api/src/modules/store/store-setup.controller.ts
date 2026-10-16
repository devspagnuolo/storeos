import { BadRequestException, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { evaluateReadiness } from './store-readiness';
import { PrismaService } from '../../shared/infrastructure/prisma.service';

@ApiTags('Store')
@Controller('store/setup')
@RequirePermissions(Permissions.SETTINGS_WRITE)
export class StoreSetupController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Pendências de configuração calculadas com dados da loja autenticada' })
  async get(@CurrentStore() storeId: string) {
    const [store, products, stockedProducts, withoutImage, withoutPrice, shippingRules, confirmedPayments, pages, bling, activeDomains] = await Promise.all([
      this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { name: true, logoUrl: true, themeConfig: true, storefrontPublishedAt: true, whatsappNumber: true, storefrontOpen: true, businessProfile: true } }),
      this.prisma.product.count({ where: { storeId, status: 'ACTIVE' } }),
      this.prisma.product.count({ where: {
        storeId, status: 'ACTIVE',
        inventory: { some: { storeId, quantity: { gt: this.prisma.inventory.fields.reserved } } },
      } }),
      this.prisma.product.count({ where: { storeId, status: 'ACTIVE', images: { none: {} } } }),
      this.prisma.product.count({ where: { storeId, status: 'ACTIVE', price: { lte: 0 } } }),
      this.prisma.shippingRule.count({ where: { storeId, active: true } }),
      this.prisma.payment.count({ where: { status: 'PAID', order: { storeId } } }),
      this.prisma.page.findMany({ where: { storeId, published: true, kind: 'PAGE' }, select: { slug: true } }),
      this.prisma.blingConnection.count({ where: { storeId } }),
      this.prisma.storeDomain.count({ where: { storeId, status: 'ACTIVE' } }),
    ]);
    const env = (name: string) => Boolean(process.env[name]?.trim());
    const paymentConfigured = env('MERCADOPAGO_ACCESS_TOKEN');
    const webhookConfigured = env('MERCADOPAGO_WEBHOOK_SECRET');
    const callbackConfigured = Boolean(process.env.API_PUBLIC_URL?.startsWith('https://'));
    const theme = store.themeConfig as Record<string, unknown>;
    const readiness = evaluateReadiness({
      storeName: store.name, hasLogo: Boolean(store.logoUrl), whatsapp: Boolean(store.whatsappNumber?.trim()),
      activeProducts: products, stockedProducts, productsWithoutImage: withoutImage, productsWithoutPrice: withoutPrice,
      storefrontCustomized: Boolean(store.storefrontPublishedAt || theme?.heroTitle), shippingRules,
      carrierConfigured: env('SUPERFRETE_TOKEN') || env('MELHOR_ENVIO_TOKEN'),
      paymentConfigured, webhookConfigured, callbackConfigured,
      cardConfigured: (paymentConfigured && (env('MERCADOPAGO_PUBLIC_KEY') || env('NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY'))),
      confirmedPayments, publishedPageSlugs: pages.map(page => page.slug.toLowerCase()),
      profileDone: store.storefrontOpen || Boolean((store.businessProfile as { segment?: string } | null)?.segment),
      emailConfigured: env('RESEND_API_KEY'), blingConnected: bling > 0, activeDomains,
    });
    return {
      storeName: store.name, open: store.storefrontOpen, ...readiness,
      payment: { paymentConfigured, webhookConfigured, callbackConfigured, confirmedPayments },
    };
  }

  @Post('open')
  @HttpCode(200)
  @ApiOperation({ summary: 'Abre a loja ao público quando o que bloqueia a abertura está resolvido' })
  async open(@CurrentStore() storeId: string) {
    const setup = await this.get(storeId);
    if (setup.launchBlockers.length) {
      const titles = setup.steps.filter(step => setup.launchBlockers.includes(step.id)).map(step => step.title);
      throw new BadRequestException({ message: `Ainda falta: ${titles.join('; ')}.`, code: 'LAUNCH_BLOCKED', blockers: setup.launchBlockers });
    }
    await this.prisma.store.update({ where: { id: storeId }, data: { storefrontOpen: true } });
    return { open: true };
  }

  @Post('close')
  @HttpCode(200)
  @ApiOperation({ summary: 'Volta a loja para "em construção"' })
  async close(@CurrentStore() storeId: string) {
    await this.prisma.store.update({ where: { id: storeId }, data: { storefrontOpen: false } });
    return { open: false };
  }
}
