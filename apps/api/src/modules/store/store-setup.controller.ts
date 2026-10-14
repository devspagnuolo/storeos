import { Controller, Get } from '@nestjs/common';
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
    const [store, products, stockedProducts, withoutImage, withoutPrice, shippingRules, confirmedPayments, pages, bling] = await Promise.all([
      this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { name: true, logoUrl: true, themeConfig: true, storefrontPublishedAt: true, whatsappNumber: true } }),
      this.prisma.product.count({ where: { storeId, status: 'ACTIVE' } }),
      this.prisma.product.count({ where: {
        storeId, status: 'ACTIVE',
        inventory: { some: { storeId, quantity: { gt: this.prisma.inventory.fields.reserved } } },
      } }),
      this.prisma.product.count({ where: { storeId, status: 'ACTIVE', images: { none: {} } } }),
      this.prisma.product.count({ where: { storeId, status: 'ACTIVE', price: { lte: 0 } } }),
      this.prisma.shippingRule.count({ where: { storeId, active: true } }),
      this.prisma.payment.count({ where: { status: 'PAID', order: { storeId } } }),
      this.prisma.page.findMany({ where: { storeId, published: true }, select: { slug: true } }),
      this.prisma.blingConnection.count({ where: { storeId } }),
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
      cardConfigured: (env('REDE_PV') && env('REDE_TOKEN')) || (paymentConfigured && (env('MERCADOPAGO_PUBLIC_KEY') || env('NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY'))),
      confirmedPayments, publishedPageSlugs: pages.map(page => page.slug.toLowerCase()),
      emailConfigured: env('RESEND_API_KEY'), blingConnected: bling > 0,
    });
    return {
      storeName: store.name, ...readiness,
      payment: { paymentConfigured, webhookConfigured, callbackConfigured, confirmedPayments },
    };
  }
}
