import { Injectable, Logger } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { money } from '../../shared/money/money';
import { OrderLifecycleService } from '../orders/order-lifecycle.service';
import { MercadoPagoClient } from './mercado-pago.client';
import { MERCADO_PAGO, mapMercadoPagoStatus } from './mercado-pago.provider';

@Injectable()
export class PaymentsWebhookService {
  private readonly logger = new Logger(PaymentsWebhookService.name);

  constructor(private readonly prisma: PrismaService, private readonly client: MercadoPagoClient, private readonly lifecycle: OrderLifecycleService) {}

  /** Sincroniza o pagamento com o estado real no Mercado Pago. Idempotente: pode ser chamado várias vezes. */
  async syncMercadoPagoPayment(paymentId: string) {
    const payment = await this.prisma.payment.findFirst({ where: { provider: MERCADO_PAGO, transactionId: paymentId }, include: { order: true } });
    if (!payment) return 'ignorado (pagamento desconhecido)';
    const remote = await this.client.getPayment(paymentId);
    const status = mapMercadoPagoStatus(remote.status);
    if (remote.external_reference !== payment.order.number) {
      this.logger.warn(`Pagamento ${paymentId} aponta para ${remote.external_reference}, esperado ${payment.order.number}`);
      return 'ignorado (referência divergente)';
    }
    if (status === PaymentStatus.PAID) {
      // Só confirma se o valor pago cobre o total do pedido.
      if (money(remote.transaction_amount).lessThan(payment.amount)) return 'ignorado (valor menor que o pedido)';
      const changed = await this.lifecycle.markPaid({ orderId: payment.orderId }, { message: `Pagamento PIX aprovado no Mercado Pago (${paymentId})` }).catch(error => {
        this.logger.error(`Pagamento ${paymentId} aprovado, mas o pedido ${payment.order.number} não pôde ser confirmado: ${(error as Error).message}`);
        return false;
      });
      return changed ? 'pedido pago' : 'sem mudança';
    }
    if (status === PaymentStatus.CANCELLED || status === PaymentStatus.FAILED) {
      const changed = await this.lifecycle.cancel({ orderId: payment.orderId }, { message: `Pagamento ${remote.status} no Mercado Pago`, paymentStatus: status }).catch(() => false);
      return changed ? 'pedido cancelado' : 'sem mudança';
    }
    await this.prisma.payment.update({ where: { id: payment.id }, data: { status } });
    return `status ${status}`;
  }
}
