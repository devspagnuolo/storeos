import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventNames } from '@storeos/contracts';
import { AppConfig } from '../../../config/app-config';
import { BusinessRuleError, NotFoundError } from '../../../shared/domain/errors';
import { fromCents, toCents } from '../../../shared/domain/money';
import { AuditService } from '../../../shared/infrastructure/audit/audit.service';
import { OutboxService } from '../../../shared/infrastructure/outbox/outbox.service';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { OrdersService } from '../../orders/application/orders.service';
import { ChargeResult } from '../providers/payment-provider';
import { PaymentGatewayService } from './payment-gateway.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PaymentGatewayService,
    private readonly orders: OrdersService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
  ) {}

  notificationUrl(storeId: string, providerKey: string): string {
    return `${this.config.env.PUBLIC_API_URL}/api/v1/webhooks/payments/${providerKey}?store=${storeId}`;
  }

  /** Aplica o resultado do provedor ao Payment e propaga para o pedido. Idempotente. */
  async applyResult(storeId: string, paymentId: string, result: ChargeResult): Promise<void> {
    const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, storeId } });
    if (!payment) throw new NotFoundError('Pagamento não encontrado');

    const data: Prisma.PaymentUpdateInput = {
      providerPaymentId: result.providerPaymentId,
      providerStatus: result.providerStatus,
      status: result.status,
      cardBrand: result.cardBrand ?? undefined,
      cardLast4: result.cardLast4 ?? undefined,
      pixQrCode: result.pixQrCode ?? undefined,
      pixCopyPaste: result.pixCopyPaste ?? undefined,
      boletoUrl: result.boletoUrl ?? undefined,
      boletoBarcode: result.boletoBarcode ?? undefined,
      expiresAt: result.expiresAt ?? undefined,
      failureReason: result.failureReason ?? undefined,
      raw: (result.raw ?? undefined) as Prisma.InputJsonValue | undefined,
    };
    if (result.status === 'PAID' && !payment.paidAt) data.paidAt = new Date();
    if (result.status === 'FAILED') data.failedAt = new Date();
    if (result.status === 'AUTHORIZED') data.authorizedAt = new Date();
    await this.prisma.payment.update({ where: { id: paymentId }, data });

    if (result.status === 'PAID') {
      await this.orders.markPaid(storeId, payment.orderId, payment.id);
      await this.prisma.runInTransaction((tx) =>
        this.outbox.enqueue(tx, { storeId, aggregateType: 'Payment', aggregateId: payment.id, eventName: EventNames.PAYMENT_CONFIRMED, payload: { paymentId: payment.id, orderId: payment.orderId } }),
      );
    } else if (result.status === 'FAILED' || result.status === 'EXPIRED' || result.status === 'CANCELLED') {
      const order = await this.prisma.order.findFirst({ where: { id: payment.orderId, storeId } });
      if (order && ['NEW', 'AWAITING_PAYMENT'].includes(order.status)) {
        const reason = result.status === 'EXPIRED' ? 'Pagamento expirado' : (result.failureReason ?? 'Pagamento não aprovado');
        await this.prisma.runInTransaction((tx) => this.orders.transition(tx, storeId, order.id, 'CANCELLED', { note: reason, reason }));
      }
    } else if (result.status === 'CHARGEBACK') {
      await this.orders.addNote(storeId, payment.orderId, 'Chargeback recebido do adquirente — revisar pedido', false);
    }
  }

  /** Processa notificação do provedor: valida assinatura, deduplica e consulta o estado real no provedor. */
  async handleWebhook(input: { providerKey: string; storeId: string; headers: Record<string, string | string[] | undefined>; rawBody: Buffer; query: Record<string, string> }): Promise<{ accepted: boolean }> {
    const { provider, credentials } = await this.gateway.resolve(input.storeId, input.providerKey);
    const parsed = provider.parseWebhook({ headers: input.headers, rawBody: input.rawBody, query: input.query, credentials });
    const isMock = provider.key === 'mock';

    const event = await this.prisma.webhookEvent
      .create({
        data: {
          storeId: input.storeId,
          provider: provider.key,
          eventId: parsed.eventId,
          eventType: parsed.eventType,
          payload: this.safeJson(input.rawBody),
          signatureValid: parsed.valid,
        },
      })
      .catch((err: unknown) => {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null; // reentrega
        throw err;
      });
    if (!event) return { accepted: true };
    if (!parsed.valid && !isMock) {
      await this.prisma.webhookEvent.update({ where: { id: event.id }, data: { status: 'IGNORED', error: 'Assinatura inválida' } });
      return { accepted: false };
    }
    if (!parsed.providerPaymentId) {
      await this.prisma.webhookEvent.update({ where: { id: event.id }, data: { status: 'IGNORED', processedAt: new Date() } });
      return { accepted: true };
    }

    try {
      const payment = await this.prisma.payment.findFirst({ where: { storeId: input.storeId, provider: provider.key, providerPaymentId: parsed.providerPaymentId } });
      if (!payment) {
        await this.prisma.webhookEvent.update({ where: { id: event.id }, data: { status: 'IGNORED', processedAt: new Date(), error: 'Pagamento desconhecido' } });
        return { accepted: true };
      }
      const fresh = await provider.fetchPayment(parsed.providerPaymentId, credentials);
      await this.applyResult(input.storeId, payment.id, fresh);
      await this.prisma.webhookEvent.update({ where: { id: event.id }, data: { status: 'PROCESSED', processedAt: new Date() } });
    } catch (err) {
      this.logger.error(`Webhook ${provider.key}/${parsed.eventId} falhou: ${(err as Error).message}`);
      await this.prisma.webhookEvent.update({ where: { id: event.id }, data: { status: 'FAILED', error: (err as Error).message.slice(0, 500) } });
      throw err; // provedor reenviará
    }
    return { accepted: true };
  }

  async refundOrder(storeId: string, orderId: string, input: { amountCents?: number; reason: string }, actorId?: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, storeId }, include: { payments: true } });
    if (!order) throw new NotFoundError('Pedido não encontrado', 'ORDER_NOT_FOUND');
    const payment = order.payments.find((p) => ['PAID', 'PARTIALLY_REFUNDED'].includes(p.status));
    if (!payment || !payment.providerPaymentId) throw new BusinessRuleError('Pedido sem pagamento confirmado para estornar', 'NOT_REFUNDABLE');

    const alreadyRefunded = await this.prisma.refund.aggregate({ where: { paymentId: payment.id, status: { in: ['PENDING', 'COMPLETED'] } }, _sum: { amount: true } });
    const refundable = toCents(payment.amount) - toCents(alreadyRefunded._sum.amount);
    const amount = input.amountCents ?? refundable;
    if (amount <= 0 || amount > refundable) throw new BusinessRuleError(`Valor de estorno inválido (máximo ${(refundable / 100).toFixed(2)})`, 'INVALID_REFUND_AMOUNT');

    const { provider, credentials } = await this.gateway.resolve(storeId, payment.provider);
    const partial = amount < refundable;
    const outcome = await provider.refund(payment.providerPaymentId, partial ? amount : null, credentials);

    const refund = await this.prisma.refund.create({
      data: { storeId, orderId, paymentId: payment.id, amount: fromCents(amount), reason: input.reason, status: outcome.status, providerRefundId: outcome.providerRefundId, completedAt: outcome.status === 'COMPLETED' ? new Date() : null },
    });
    await this.prisma.payment.update({ where: { id: payment.id }, data: { status: partial ? 'PARTIALLY_REFUNDED' : 'REFUNDED' } });
    if (!partial) {
      await this.prisma.runInTransaction(async (tx) => {
        const current = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
        if (['PAID', 'PICKING', 'INVOICED', 'DELIVERED', 'RETURNED'].includes(current.status)) {
          await this.orders.transition(tx, storeId, orderId, 'REFUNDED', { note: `Pedido reembolsado: ${input.reason}` });
        }
        await this.outbox.enqueue(tx, { storeId, aggregateType: 'Payment', aggregateId: payment.id, eventName: EventNames.PAYMENT_REFUNDED, payload: { paymentId: payment.id, orderId, amountCents: amount } });
      });
    } else {
      await this.orders.addNote(storeId, orderId, `Estorno parcial de R$ ${(amount / 100).toFixed(2).replace('.', ',')}: ${input.reason}`, false, actorId);
    }
    await this.audit.record({ storeId, action: 'orders.refunded', entityType: 'Order', entityId: orderId, after: { amountCents: amount, reason: input.reason }, actorId, actorType: actorId ? 'USER' : 'SYSTEM' });
    return refund;
  }

  private safeJson(raw: Buffer): Prisma.InputJsonValue {
    try {
      return JSON.parse(raw.toString('utf8') || '{}') as Prisma.InputJsonValue;
    } catch {
      return { raw: raw.toString('utf8').slice(0, 2000) };
    }
  }
}
