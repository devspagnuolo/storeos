import { BadGatewayException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderStatus, PaymentStatus, RefundMode, RefundStatus } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { OrderLifecycleService } from '../orders/order-lifecycle.service';
import { MercadoPagoClient } from './mercado-pago.client';
import { MERCADO_PAGO } from './mercado-pago.provider';
import { isFullRefund, remainingToRefund, resolveRefundAmount } from './refund-rules';

export type RefundInput = { amount?: unknown; reason: string; mode: RefundMode };

@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(private readonly prisma: PrismaService, private readonly mercadoPago: MercadoPagoClient, private readonly lifecycle: OrderLifecycleService) {}

  async list(storeId: string, number: string) {
    const order = await this.prisma.order.findUnique({ where: { storeId_number: { storeId, number } }, include: { refunds: { orderBy: { createdAt: 'desc' } }, payments: { where: { status: { in: [PaymentStatus.PAID, PaymentStatus.REFUNDED] } }, take: 1 } } });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    const payment = order.payments[0];
    return {
      paid: payment?.amount.toFixed(2) ?? null,
      remaining: payment ? remainingToRefund(payment.amount, order.refunds).toFixed(2) : '0.00',
      gatewayAvailable: payment?.provider === MERCADO_PAGO && this.mercadoPago.configured,
      refunds: order.refunds.map(r => ({ id: r.id, amount: r.amount.toFixed(2), reason: r.reason, mode: r.mode, status: r.status, gatewayRefundId: r.gatewayRefundId, error: r.error, createdAt: r.createdAt })),
    };
  }

  /** Reserva o valor (linha PENDING sob trava do pagamento) antes de falar com o gateway, para que dois cliques não devolvam em dobro. */
  async create(storeId: string, number: string, input: RefundInput, actorId?: string) {
    const reserved = await this.prisma.$transaction(async tx => {
      const order = await tx.order.findUnique({ where: { storeId_number: { storeId, number } }, select: { id: true, number: true, total: true } });
      if (!order) throw new NotFoundException('Pedido não encontrado');
      const payment = await tx.payment.findFirst({ where: { orderId: order.id, status: PaymentStatus.PAID } });
      if (!payment) throw new ConflictException('Só é possível reembolsar pedidos com pagamento confirmado.');
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${payment.id} FOR UPDATE`;
      const refunds = await tx.refund.findMany({ where: { orderId: order.id } });
      const amount = resolveRefundAmount(input.amount, remainingToRefund(payment.amount, refunds));
      if (input.mode === RefundMode.GATEWAY) {
        if (payment.provider !== MERCADO_PAGO || !payment.transactionId) throw new ConflictException('Este pagamento não foi feito pelo Mercado Pago. Devolva pelo painel da operadora e registre como reembolso manual.');
        if (!this.mercadoPago.configured) throw new ConflictException('Mercado Pago não está configurado neste ambiente.');
      }
      const refund = await tx.refund.create({ data: { storeId, orderId: order.id, paymentId: payment.id, amount, reason: input.reason.trim(), mode: input.mode, actorId } });
      return { refund, order, payment, previous: refunds };
    });

    const { refund, order, payment, previous } = reserved;
    let gatewayRefundId: string | null = null;
    if (input.mode === RefundMode.GATEWAY) {
      try {
        const full = isFullRefund(payment.amount, previous, refund.amount);
        const result = await this.mercadoPago.refund(payment.transactionId!, full && !previous.length ? undefined : Number(refund.amount), `storeos-refund-${refund.id}`);
        gatewayRefundId = String(result.id);
      } catch (error) {
        const message = (error as Error).message.slice(0, 500);
        this.logger.warn(`Reembolso do pedido ${order.number} recusado pelo gateway: ${message}`);
        await this.prisma.refund.update({ where: { id: refund.id }, data: { status: RefundStatus.FAILED, error: message } });
        throw new BadGatewayException('O Mercado Pago não confirmou o reembolso. Nada foi devolvido; confira o motivo no histórico e tente de novo.');
      }
    }

    const full = isFullRefund(payment.amount, previous, refund.amount);
    await this.prisma.refund.update({ where: { id: refund.id }, data: { status: RefundStatus.DONE, gatewayRefundId } });
    const label = input.mode === RefundMode.GATEWAY ? 'pelo Mercado Pago' : 'registrado manualmente';
    if (full) {
      await this.prisma.payment.updateMany({ where: { id: payment.id }, data: { status: PaymentStatus.REFUNDED } });
      await this.lifecycle.markRefunded({ orderId: order.id }, { message: `Reembolso total de R$ ${payment.amount.toFixed(2)} ${label}: ${refund.reason}` }, { actorId }).catch(error => this.logger.error(`Reembolso do pedido ${order.number} concluído, mas o status do pedido não mudou: ${(error as Error).message}`));
    } else {
      await this.prisma.orderTimeline.create({ data: { orderId: order.id, status: (await this.prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { status: true } })).status as OrderStatus, message: `Reembolso parcial de R$ ${refund.amount.toFixed(2)} ${label}: ${refund.reason}`, actorId } });
    }
    return this.list(storeId, number);
  }
}
