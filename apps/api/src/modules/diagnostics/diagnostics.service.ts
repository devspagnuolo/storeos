import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { MercadoPagoClient } from '../payments/mercado-pago.client';
import { ShippingService } from '../shipping/shipping.service';
import { buildChecks, summarize } from './diagnostics-rules';

const env = (name: string) => Boolean(process.env[name]?.trim());

@Injectable()
export class DiagnosticsService {
  constructor(private readonly prisma: PrismaService, private readonly mercadoPago: MercadoPagoClient, private readonly shipping: ShippingService) {}

  async run(storeId: string) {
    const [dbOk, outbox, shippingRules, bling, failedOrders, failedPayments] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true, () => false),
      this.prisma.outboxEvent.aggregate({ where: { publishedAt: null }, _count: { _all: true }, _min: { occurredAt: true } }).catch(() => null),
      this.prisma.shippingRule.count({ where: { storeId, active: true } }),
      this.prisma.blingConnection.findUnique({ where: { storeId }, select: { companyId: true, lastError: true, expiresAt: true } }),
      this.prisma.blingOrderSync.count({ where: { storeId, status: 'FAILED' } }),
      this.prisma.payment.count({ where: { order: { storeId }, status: { in: ['FAILED', 'CANCELLED'] }, createdAt: { gte: new Date(Date.now() - 86_400_000) } } }).catch(() => 0),
    ]);
    const carrier = this.shipping.carrierStatus();
    const oldest = outbox?._min.occurredAt;
    const checks = buildChecks({
      apiPublicUrl: process.env.API_PUBLIC_URL?.trim(), webOrigin: process.env.WEB_ORIGIN?.trim(), dbOk,
      outboxPending: outbox?._count._all ?? 0, outboxOldestMinutes: oldest ? Math.round((Date.now() - oldest.getTime()) / 60_000) : null,
      mp: { token: env('MERCADOPAGO_ACCESS_TOKEN'), webhookSecret: env('MERCADOPAGO_WEBHOOK_SECRET'), publicKey: Boolean(this.mercadoPago.publicKey), ping: env('MERCADOPAGO_ACCESS_TOKEN') ? await this.mercadoPago.ping() : 'skipped' },
      rede: { configured: env('REDE_PV') && env('REDE_TOKEN'), sandbox: process.env.REDE_SANDBOX === 'true' },
      carrier, shippingRules, email: { resend: env('RESEND_API_KEY'), from: env('MAIL_FROM') },
      bling: { appConfigured: env('BLING_CLIENT_ID') && env('BLING_CLIENT_SECRET'), connected: Boolean(bling), lastError: bling?.lastError ?? null, tokenExpired: false, companyLinked: Boolean(bling?.companyId), failedOrders },
      failedPayments24h: failedPayments,
    });
    return { checkedAt: new Date().toISOString(), summary: summarize(checks), checks };
  }

  /** Cotação real com o primeiro produto ativo da loja, para validar CEP de origem e credenciais da transportadora. */
  async shippingTest(storeId: string, zip: unknown) {
    if (typeof zip !== 'string' || zip.replace(/\D/g, '').length !== 8) throw new BadRequestException('Informe um CEP com 8 dígitos.');
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { slug: true } });
    const product = await this.prisma.product.findFirst({ where: { storeId, status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { createdAt: 'asc' } });
    if (!product) throw new NotFoundException('Publique ao menos um produto para testar a cotação.');
    const started = Date.now();
    const quote = await this.shipping.quote(store.slug, zip, [{ productId: product.id, quantity: 1 }]);
    return { product: product.name, elapsedMs: Date.now() - started, required: quote.required, options: quote.options };
  }
}
