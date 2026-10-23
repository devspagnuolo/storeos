import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma, RefundMode, RefundStatus } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { money } from '../../shared/money/money';
import { OrderLifecycleService } from '../orders/order-lifecycle.service';
import { MercadoPagoClient, MercadoPagoPayment, parseReference, referenceMatches } from './mercado-pago.client';
import { MERCADO_PAGO, mapMercadoPagoStatus } from './mercado-pago.provider';

@Injectable()
export class PaymentsWebhookService {
  private readonly logger = new Logger(PaymentsWebhookService.name);

  constructor(private readonly prisma: PrismaService, private readonly client: MercadoPagoClient, private readonly lifecycle: OrderLifecycleService) {}

  /** Sincroniza o pagamento com o estado real no Mercado Pago. Idempotente: pode ser chamado várias vezes. */
  async syncMercadoPagoPayment(paymentId: string) {
    let payment = await this.prisma.payment.findFirst({ where: { provider: MERCADO_PAGO, transactionId: paymentId }, include: { order: true } });
    // Desconhecido aqui: pode ser cobrança criada no Mercado Pago sem o id gravado (a API caiu no meio), então procura pelo pedido.
    // Se nem o Mercado Pago souber dela, ignora em vez de falhar (senão a notificação seria repetida para sempre).
    const remote = payment ? await this.client.getPayment(paymentId) : await this.client.getPayment(paymentId).catch(() => null);
    if (!payment && remote) payment = await this.adoptOrphan(paymentId, remote);
    if (!payment || !remote) return 'ignorado (pagamento desconhecido)';
    const status = mapMercadoPagoStatus(remote.status);
    if (!referenceMatches(remote.external_reference, payment.order.storeId, payment.order.number)) {
      this.logger.warn(`Pagamento ${paymentId} aponta para ${remote.external_reference}, esperado ${payment.order.number}`);
      return 'ignorado (referência divergente)';
    }
    if (status === PaymentStatus.PAID) {
      // Só confirma se o valor pago cobre o total do pedido.
      if (money(remote.transaction_amount).lessThan(payment.amount)) return 'ignorado (valor menor que o pedido)';
      // Aprovado depois de o pedido ter sido cancelado (prazo vencido ou cartão em análise): o estoque já foi liberado, então o valor volta ao cliente.
      if (payment.order.status === OrderStatus.CANCELLED) return this.refundLatePayment(payment, paymentId);
      const changed = await this.lifecycle.markPaid({ orderId: payment.orderId }, { message: `Pagamento aprovado no Mercado Pago (${paymentId})` }).catch(error => {
        this.logger.error(`Pagamento ${paymentId} aprovado, mas o pedido ${payment.order.number} não pôde ser confirmado: ${(error as Error).message}`);
        return false;
      });
      return changed ? 'pedido pago' : 'sem mudança';
    }
    if (status === PaymentStatus.CANCELLED || status === PaymentStatus.FAILED) {
      const changed = await this.lifecycle.cancel({ orderId: payment.orderId }, { message: `Pagamento ${remote.status} no Mercado Pago`, paymentStatus: status }).catch(() => false);
      return changed ? 'pedido cancelado' : 'sem mudança';
    }
    if (status === PaymentStatus.REFUNDED) {
      // Estorno ou chargeback feito fora do painel: o pedido acompanha. Se o reembolso partiu daqui, o pedido já está reembolsado e nada muda.
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status } });
      const changed = await this.lifecycle.markRefunded({ orderId: payment.orderId }, { message: `Pagamento ${remote.status === 'charged_back' ? 'contestado (chargeback)' : 'estornado'} no Mercado Pago` }).catch(() => false);
      return changed ? 'pedido reembolsado' : 'sem mudança';
    }
    await this.prisma.payment.update({ where: { id: payment.id }, data: { status } });
    return `status ${status}`;
  }

  /**
   * Liga ao pedido uma cobrança do Mercado Pago cujo id não chegou a ser gravado. Só com a referência nova (loja + número),
   * que é única, e só se o pedido tiver uma cobrança ainda sem id e com o mesmo valor. Condicional: não sobrescreve outra.
   */
  private async adoptOrphan(paymentId: string, remote: MercadoPagoPayment) {
    const ref = parseReference(remote.external_reference);
    if (!ref) return null;
    const order = await this.prisma.order.findUnique({ where: { storeId_number: { storeId: ref.storeId, number: ref.orderNumber } }, select: { id: true } });
    if (!order) return null;
    const pending = await this.prisma.payment.findFirst({ where: { orderId: order.id, transactionId: null }, orderBy: { createdAt: 'desc' } });
    if (!pending || !money(remote.transaction_amount).equals(pending.amount)) return null;
    const adopted = await this.prisma.payment.updateMany({ where: { id: pending.id, transactionId: null }, data: { provider: MERCADO_PAGO, transactionId: paymentId } });
    if (!adopted.count) return null;
    this.logger.warn(`Cobrança ${paymentId} do pedido ${ref.orderNumber} não estava gravada e foi ligada ao pedido pelo webhook`);
    return this.prisma.payment.findUnique({ where: { id: pending.id }, include: { order: true } });
  }

  /** Devolve pelo gateway um pagamento aprovado que chegou tarde demais para o pedido. Idempotente: não repete se já houver reembolso. */
  private async refundLatePayment(payment: { id: string; orderId: string; amount: Prisma.Decimal; order: { number: string; storeId: string } }, paymentId: string) {
    if (await this.prisma.refund.findFirst({ where: { paymentId: payment.id, status: { not: RefundStatus.FAILED } } })) return 'sem mudança';
    const refund = await this.prisma.refund.create({ data: { storeId: payment.order.storeId, orderId: payment.orderId, paymentId: payment.id, amount: payment.amount, reason: 'Pagamento aprovado depois do cancelamento do pedido', mode: RefundMode.GATEWAY } });
    try {
      const result = await this.client.refund(paymentId, undefined, `storeos-refund-${refund.id}`);
      await this.prisma.refund.update({ where: { id: refund.id }, data: { status: RefundStatus.DONE, gatewayRefundId: String(result.id) } });
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.REFUNDED } });
      await this.prisma.orderTimeline.create({ data: { orderId: payment.orderId, status: OrderStatus.CANCELLED, message: `Pagamento aprovado após o cancelamento: R$ ${payment.amount.toFixed(2)} devolvido automaticamente (${paymentId})` } });
      return 'pagamento tardio devolvido';
    } catch (error) {
      const message = (error as Error).message.slice(0, 500);
      this.logger.error(`Pagamento ${paymentId} aprovado após o cancelamento do pedido ${payment.order.number} e o estorno automático falhou: ${message}`);
      await this.prisma.refund.update({ where: { id: refund.id }, data: { status: RefundStatus.FAILED, error: message } });
      await this.prisma.orderTimeline.create({ data: { orderId: payment.orderId, status: OrderStatus.CANCELLED, message: `ATENÇÃO: pagamento aprovado após o cancelamento e a devolução automática falhou. Devolva manualmente (${paymentId}).` } });
      throw error; // o Mercado Pago repete a notificação, e a devolução é tentada de novo
    }
  }
}
