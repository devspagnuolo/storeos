import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma, StockMovementType } from '@prisma/client';
import { earnForOrder, reverseForOrder } from '../loyalty/ledger';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { recordMovement } from '../inventory/stock-ledger';
import { inventoryOf } from './order-lines';

type Tx = Prisma.TransactionClient;
export type OrderRef = { storeId: string; number: string } | { orderId: string };

/**
 * Transições de pagamento do pedido. Cada transição é condicional ao status atual,
 * então webhooks repetidos, cliques duplos e o job de expiração não aplicam o mesmo efeito duas vezes.
 */
@Injectable()
export class OrderLifecycleService {
  private readonly logger = new Logger(OrderLifecycleService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async find(tx: Tx, ref: OrderRef) {
    const order = 'orderId' in ref
      ? await tx.order.findUnique({ where: { id: ref.orderId }, include: { items: true } })
      : await tx.order.findUnique({ where: { storeId_number: { storeId: ref.storeId, number: ref.number } }, include: { items: true } });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    return order;
  }

  /** Confirma o pagamento: baixa o estoque reservado. Retorna false se o pedido já tinha saído de "aguardando pagamento". */
  async markPaid(ref: OrderRef, source: { actorId?: string; message?: string } = {}) {
    return this.prisma.$transaction(async tx => {
      const order = await this.find(tx, ref);
      const moved = await tx.order.updateMany({ where: { id: order.id, status: OrderStatus.AWAITING_PAYMENT }, data: { status: OrderStatus.PAID } });
      if (!moved.count) {
        if (order.status === OrderStatus.PAID) return false;
        throw new ConflictException(`Pedido ${order.number} não está aguardando pagamento`);
      }
      for (const item of order.items) {
        if (!item.productId) continue;
        await tx.$executeRaw`UPDATE "Inventory" SET "quantity" = "quantity" - ${item.quantity}, "reserved" = GREATEST("reserved" - ${item.quantity}, 0), "updatedAt" = NOW()
          WHERE "storeId" = ${order.storeId} AND "productId" = ${item.productId} AND ${inventoryOf(item.variantId)}`;
        await recordMovement(tx, { storeId: order.storeId, productId: item.productId, variantId: item.variantId, type: StockMovementType.SALE, delta: -item.quantity, orderNumber: order.number, actorId: source.actorId });
      }
      await tx.payment.updateMany({ where: { orderId: order.id, status: { in: [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED] } }, data: { status: PaymentStatus.PAID, paidAt: new Date() } });
      await earnForOrder(tx, order);
      await tx.orderTimeline.create({ data: { orderId: order.id, status: OrderStatus.PAID, message: source.message ?? 'Pagamento confirmado', actorId: source.actorId } });
      await tx.outboxEvent.create({ data: { storeId: order.storeId, aggregateType: 'Order', aggregateId: order.id, eventName: 'orders.order-paid.v1', payload: { orderNumber: order.number, total: order.total.toString() } } });
      return true;
    });
  }

  /** Cancela um pedido ainda não pago e devolve a reserva ao estoque disponível. */
  async cancel(ref: OrderRef, source: { actorId?: string; message?: string; paymentStatus?: PaymentStatus } = {}) {
    return this.prisma.$transaction(async tx => {
      const order = await this.find(tx, ref);
      const moved = await tx.order.updateMany({ where: { id: order.id, status: { in: [OrderStatus.NEW, OrderStatus.AWAITING_PAYMENT] } }, data: { status: OrderStatus.CANCELLED } });
      if (!moved.count) {
        if (order.status === OrderStatus.CANCELLED) return false;
        throw new ConflictException(`Pedido ${order.number} não pode mais ser cancelado (status ${order.status})`);
      }
      // Só pedidos do checkout reservaram estoque; pedidos manuais (NEW) não têm o que devolver.
      if (order.status === OrderStatus.AWAITING_PAYMENT) {
        for (const item of order.items) {
          if (!item.productId) continue;
          await tx.$executeRaw`UPDATE "Inventory" SET "reserved" = GREATEST("reserved" - ${item.quantity}, 0), "updatedAt" = NOW()
            WHERE "storeId" = ${order.storeId} AND "productId" = ${item.productId} AND ${inventoryOf(item.variantId)}`;
        }
      }
      // Pedido cancelado devolve o uso do cupom.
      const redemption = await tx.couponRedemption.findUnique({ where: { orderId: order.id } });
      if (redemption) {
        await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = GREATEST("usedCount" - 1, 0), "updatedAt" = NOW() WHERE "id" = ${redemption.couponId}`;
        await tx.couponRedemption.delete({ where: { id: redemption.id } });
      }
      await tx.payment.updateMany({ where: { orderId: order.id, status: { in: [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED] } }, data: { status: source.paymentStatus ?? PaymentStatus.CANCELLED } });
      await tx.orderTimeline.create({ data: { orderId: order.id, status: OrderStatus.CANCELLED, message: source.message ?? 'Pedido cancelado', actorId: source.actorId } });
      await tx.outboxEvent.create({ data: { storeId: order.storeId, aggregateType: 'Order', aggregateId: order.id, eventName: 'orders.order-cancelled.v1', payload: { orderNumber: order.number } } });
      return true;
    });
  }

  /**
   * Avança o pedido de `from` para `to` de forma idempotente: repetir a chamada quando o pedido já está em `to` devolve false;
   * qualquer outro status é conflito. `apply` grava os dados logísticos dentro da mesma transação.
   */
  private async advance(
    ref: OrderRef,
    step: { from: OrderStatus[]; to: OrderStatus; event: string; message: string; actorId?: string; fulfillment: Omit<Prisma.FulfillmentUncheckedUpdateInput, 'orderId' | 'storeId'>; payload?: Prisma.InputJsonObject; restock?: boolean; reverseLoyalty?: boolean },
  ) {
    return this.prisma.$transaction(async tx => {
      const order = await this.find(tx, ref);
      const moved = await tx.order.updateMany({ where: { id: order.id, status: { in: step.from } }, data: { status: step.to } });
      if (!moved.count) {
        if (order.status === step.to) return false;
        throw new ConflictException(`Pedido ${order.number} está em ${order.status} e não pode ir para ${step.to}`);
      }
      await tx.fulfillment.upsert({
        where: { orderId: order.id },
        create: { orderId: order.id, storeId: order.storeId, ...(step.fulfillment as Omit<Prisma.FulfillmentUncheckedCreateInput, 'orderId' | 'storeId'>) },
        update: step.fulfillment,
      });
      if (step.restock) {
        for (const item of order.items) {
          if (!item.productId) continue;
          await tx.$executeRaw`UPDATE "Inventory" SET "quantity" = "quantity" + ${item.quantity}, "updatedAt" = NOW()
            WHERE "storeId" = ${order.storeId} AND "productId" = ${item.productId} AND ${inventoryOf(item.variantId)}`;
          await recordMovement(tx, { storeId: order.storeId, productId: item.productId, variantId: item.variantId, type: StockMovementType.RETURN, delta: item.quantity, orderNumber: order.number, actorId: step.actorId, reason: step.message });
        }
      }
      if (step.reverseLoyalty) await reverseForOrder(tx, order);
      await tx.orderTimeline.create({ data: { orderId: order.id, status: step.to, message: step.message, actorId: step.actorId } });
      await tx.outboxEvent.create({ data: { storeId: order.storeId, aggregateType: 'Order', aggregateId: order.id, eventName: step.event, payload: { orderNumber: order.number, ...step.payload } } });
      return true;
    });
  }

  /** Pago → em separação. */
  startPicking(ref: OrderRef, by: { actorId?: string } = {}) {
    return this.advance(ref, { from: [OrderStatus.PAID], to: OrderStatus.PICKING, event: 'orders.order-picking.v1', message: 'Separação iniciada', actorId: by.actorId, fulfillment: { pickedAt: new Date() } });
  }

  /** Em separação → faturado, com os dados da nota fiscal. */
  markInvoiced(ref: OrderRef, data: { invoiceNumber: string; invoiceKey?: string }, by: { actorId?: string } = {}) {
    return this.advance(ref, { from: [OrderStatus.PICKING], to: OrderStatus.INVOICED, event: 'orders.order-invoiced.v1', message: `Nota fiscal ${data.invoiceNumber} emitida`, actorId: by.actorId, fulfillment: { invoiceNumber: data.invoiceNumber, invoiceKey: data.invoiceKey ?? null, invoicedAt: new Date() }, payload: { invoiceNumber: data.invoiceNumber } });
  }

  /** Faturado → expedido, com transportadora e código de rastreio. */
  markShipped(ref: OrderRef, data: { carrier: string; trackingCode: string; trackingUrl?: string }, by: { actorId?: string } = {}) {
    return this.advance(ref, { from: [OrderStatus.INVOICED], to: OrderStatus.SHIPPED, event: 'orders.order-shipped.v1', message: `Enviado por ${data.carrier} (${data.trackingCode})`, actorId: by.actorId, fulfillment: { carrier: data.carrier, trackingCode: data.trackingCode, trackingUrl: data.trackingUrl ?? null, shippedAt: new Date() }, payload: { carrier: data.carrier, trackingCode: data.trackingCode } });
  }

  /** Expedido → entregue. */
  markDelivered(ref: OrderRef, by: { actorId?: string } = {}) {
    return this.advance(ref, { from: [OrderStatus.SHIPPED], to: OrderStatus.DELIVERED, event: 'orders.order-delivered.v1', message: 'Pedido entregue', actorId: by.actorId, fulfillment: { deliveredAt: new Date() } });
  }

  /** Entregue → devolvido; por padrão os itens voltam ao estoque. */
  markReturned(ref: OrderRef, data: { reason: string; restock?: boolean }, by: { actorId?: string } = {}) {
    return this.advance(ref, { from: [OrderStatus.DELIVERED], to: OrderStatus.RETURNED, event: 'orders.order-returned.v1', message: `Devolução registrada: ${data.reason}`, actorId: by.actorId, fulfillment: { returnReason: data.reason, returnedAt: new Date() }, payload: { reason: data.reason }, restock: data.restock ?? true, reverseLoyalty: true });
  }

  /** Cancela pedidos cujo prazo de pagamento venceu, liberando o estoque reservado. */
  async expireOverdue(now = new Date(), limit = 100) {
    const overdue = await this.prisma.order.findMany({
      where: { status: OrderStatus.AWAITING_PAYMENT, payments: { some: { status: PaymentStatus.PENDING, expiresAt: { lt: now } } } },
      select: { id: true, number: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    let expired = 0;
    for (const order of overdue) {
      try {
        if (await this.cancel({ orderId: order.id }, { message: 'Prazo de pagamento expirado', paymentStatus: PaymentStatus.CANCELLED })) expired++;
      } catch (error) {
        // Um pedido pago entre a busca e o cancelamento não deve derrubar o lote.
        this.logger.warn(`Não foi possível expirar ${order.number}: ${(error as Error).message}`);
      }
    }
    return expired;
  }
}
