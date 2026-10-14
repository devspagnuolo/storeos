import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { PrismaService } from '../../shared/infrastructure/prisma.service';

@ApiTags('Store')
@Controller('store/setup')
@RequirePermissions(Permissions.SETTINGS_WRITE)
export class StoreSetupController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Pendências de configuração calculadas com dados da loja autenticada' })
  async get(@CurrentStore() storeId: string) {
    const [store, products, stockedProducts, shippingRules, confirmedPayments] = await Promise.all([
      this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { name: true, logoUrl: true, themeConfig: true, storefrontPublishedAt: true } }),
      this.prisma.product.count({ where: { storeId, status: 'ACTIVE' } }),
      this.prisma.product.count({ where: {
        storeId, status: 'ACTIVE',
        inventory: { some: { storeId, quantity: { gt: this.prisma.inventory.fields.reserved } } },
      } }),
      this.prisma.shippingRule.count({ where: { storeId, active: true } }),
      this.prisma.payment.count({ where: { provider: 'mercado_pago', status: 'PAID', order: { storeId } } }),
    ]);
    const paymentConfigured = Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN?.trim());
    const webhookConfigured = Boolean(process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim());
    const callbackConfigured = Boolean(process.env.API_PUBLIC_URL?.startsWith('https://'));
    const theme = store.themeConfig as Record<string, unknown>;
    const steps = [
      { id: 'identity', title: 'Apresente sua marca', description: 'Defina o nome e envie a logo da loja.', href: '/painel/configuracoes', complete: Boolean(store.name.trim() && store.logoUrl) },
      { id: 'catalog', title: 'Prepare o catálogo', description: products + ' produtos publicados; ' + stockedProducts + ' com estoque disponível.', href: '/painel/produtos', complete: stockedProducts > 0 },
      { id: 'appearance', title: 'Personalize a vitrine', description: 'Prepare o banner e publique o visual da sua loja.', href: '/painel/site', complete: Boolean(store.storefrontPublishedAt || theme?.heroTitle) },
      { id: 'shipping', title: 'Configure as entregas', description: shippingRules + ' regras de entrega ativas. Revise a cobertura e teste seu CEP.', href: '/painel/frete', complete: shippingRules > 0 },
      { id: 'payment', title: 'Confira o recebimento', description: confirmedPayments > 0 ? 'Há pagamento confirmado pelo Mercado Pago nesta loja.' : 'Valide o PIX e o retorno do pagamento antes de divulgar a loja.', href: '/painel/pagamentos', complete: paymentConfigured && webhookConfigured && callbackConfigured && confirmedPayments > 0 },
    ];
    return {
      storeName: store.name, steps, completed: steps.filter(step => step.complete).length, total: steps.length,
      payment: { paymentConfigured, webhookConfigured, callbackConfigured, confirmedPayments },
    };
  }
}
