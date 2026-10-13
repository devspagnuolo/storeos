import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventNames, ORDER_TRANSITIONS, type OrderDetailView, type OrderStatusValue, type OrderSummaryView } from '@storeos/contracts';
import { BusinessRuleError, NotFoundError } from '../../../shared/domain/errors';
import { toCents } from '../../../shared/domain/money';
import { paginate, skipTake } from '../../../shared/domain/pagination';
import { AuditService } from '../../../shared/infrastructure/audit/audit.service';
import { EncryptionService } from '../../../shared/infrastructure/crypto/encryption.service';
import { OutboxService } from '../../../shared/infrastructure/outbox/outbox.service';
import { PrismaService, Tx } from '../../../shared/infrastructure/prisma/prisma.service';
import { RequestContext } from '../../../shared/infrastructure/request-context';
import { InventoryService } from '../../inventory/application/inventory.service';
import { MarketingService } from '../../marketing/application/marketing.service';

const orderInclude = {
  items: true,
  payments: { orderBy: { createdAt: 'asc' as const } },
  timeline: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.OrderInclude;
type OrderFull = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export interface TimelineInput {
  type?: 'STATUS_CHANGE' | 'NOTE' | 'PAYMENT' | 'SHIPMENT' | 'INTEGRATION' | 'SYSTEM';
  status?: OrderStatusValue;
  message: string;
  visibleToCustomer?: boolean;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly marketing: MarketingService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly crypto: EncryptionService,
  ) {}

  /** Número sequencial por loja, atômico (sem lacunas por concorrência). */
  async nextNumber(tx: Tx, storeId: string): Promise<string> {
    const rows = await tx.$queryRaw<{ value: number }[]>`
      INSERT INTO "StoreCounter" ("storeId", "key", "value") VALUES (${storeId}, 'order', 1001)
      ON CONFLICT ("storeId", "key") DO UPDATE SET "value" = "StoreCounter"."value" + 1
      RETURNING "value"`;
    return String(rows[0].value);
  }

  trackingToken(orderId: string): string {
    return this.crypto.searchHash(`track:${orderId}`).slice(0, 32);
  }

  async addTimeline(tx: Tx | PrismaService, orderId: string, entry: TimelineInput): Promise<void> {
    const ctx = RequestContext.get();
    await tx.orderTimeline.create({
      data: {
        orderId,
        type: entry.type ?? 'SYSTEM',
        status: entry.status,
        message: entry.message,
        actorType: ctx?.actorType ?? 'SYSTEM',
        actorId: ctx?.actorId,
        visibleToCustomer: entry.visibleToCustomer ?? false,
        metadata: entry.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  // ── Consultas (admin) ──

  async list(storeId: string, q: { page: number; pageSize: number; status?: string; q?: string; from?: Date; to?: Date }) {
    const where: Prisma.OrderWhereInput = {
      storeId,
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.from || q.to ? { placedAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
      ...(q.q
        ? { OR: [{ number: { contains: q.q } }, { customerEmail: { contains: q.q, mode: 'insensitive' } }, { customerName: { contains: q.q, mode: 'insensitive' } }] }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({ where, orderBy: { placedAt: 'desc' }, ...skipTake(q.page, q.pageSize), include: { _count: { select: { items: true } } } }),
    ]);
    return paginate(rows.map((o) => this.toSummary(o, o._count.items)), total, q.page, q.pageSize);
  }

  async get(storeId: string, id: string): Promise<OrderDetailView> {
    const order = await this.prisma.order.findFirst({ where: { id, storeId }, include: orderInclude });
    if (!order) throw new NotFoundError('Pedido não encontrado', 'ORDER_NOT_FOUND');
    return this.toDetail(order, true);
  }

  async statusCounts(storeId: string): Promise<Record<string, number>> {
    const rows = await this.prisma.order.groupBy({ by: ['status'], where: { storeId }, _count: { _all: true } });
    return Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
  }

  // ── Consultas (cliente) ──

  async listForCustomer(storeId: string, customerId: string, page: number, pageSize: number) {
    const where = { storeId, customerId };
    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({ where, orderBy: { placedAt: 'desc' }, ...skipTake(page, pageSize), include: { _count: { select: { items: true } } } }),
    ]);
    return paginate(rows.map((o) => this.toSummary(o, o._count.items)), total, page, pageSize);
  }

  async getForCustomer(storeId: string, customerId: string, number: string): Promise<OrderDetailView> {
    const order = await this.prisma.order.findFirst({ where: { storeId, customerId, number }, include: orderInclude });
    if (!order) throw new NotFoundError('Pedido não encontrado', 'ORDER_NOT_FOUND');
    return this.toDetail(order, false);
  }

  /** Acompanhamento de pedido para convidados (número + token enviado por e-mail). */
  async getByTrackingToken(storeId: string, number: string, token: string): Promise<OrderDetailView> {
    const order = await this.prisma.order.findFirst({ where: { storeId, number }, include: orderInclude });
    if (!order || this.trackingToken(order.id) !== token) throw new NotFoundError('Pedido não encontrado', 'ORDER_NOT_FOUND');
    return this.toDetail(order, false);
  }

  // ── Transições ──

  async changeStatus(
    storeId: string,
    orderId: string,
    input: { status: OrderStatusValue; note?: string; trackingCode?: string; carrier?: string },
    actorId?: string,
  ): Promise<OrderDetailView> {
    await this.prisma.runInTransaction(async (tx) => {
      await this.transition(tx, storeId, orderId, input.status, { note: input.note, trackingCode: input.trackingCode, carrier: input.carrier });
    });
    await this.audit.record({ storeId, action: 'orders.status-changed', entityType: 'Order', entityId: orderId, after: { status: input.status }, actorId, actorType: actorId ? 'USER' : 'SYSTEM' });
    return this.get(storeId, orderId);
  }

  /**
   * Núcleo do OMS: valida a máquina de estados, aplica efeitos colaterais de estoque/cupom,
   * grava timeline e evento no outbox — tudo na mesma transação.
   */
  async transition(
    tx: Tx,
    storeId: string,
    orderId: string,
    to: OrderStatusValue,
    opts: { note?: string; trackingCode?: string; carrier?: string; reason?: string; silent?: boolean } = {},
  ): Promise<void> {
    // Trava a linha do pedido: duas transições concorrentes são serializadas.
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} AND "storeId" = ${storeId} FOR UPDATE`;
    const order = await tx.order.findFirst({ where: { id: orderId, storeId }, include: { items: true } });
    if (!order) throw new NotFoundError('Pedido não encontrado', 'ORDER_NOT_FOUND');
    const from = order.status as OrderStatusValue;
    if (from === to) return;
    if (!ORDER_TRANSITIONS[from].includes(to)) {
      throw new BusinessRuleError(`Transição inválida: ${from} → ${to}`, 'INVALID_ORDER_TRANSITION');
    }
    if (to === 'SHIPPED' && !(opts.trackingCode || order.trackingCode)) {
      // Envio sem rastreio é permitido (retirada/entrega própria), mas registramos explicitamente.
      opts.note = opts.note ?? 'Enviado sem código de rastreio';
    }

    const data: Prisma.OrderUpdateInput = { status: to };
    const now = new Date();
    if (to === 'PAID') {
      data.paidAt = now;
      data.paymentStatus = 'PAID';
    }
    if (to === 'SHIPPED') {
      data.shippedAt = now;
      data.fulfillmentStatus = 'FULFILLED';
      if (opts.trackingCode) data.trackingCode = opts.trackingCode;
      if (opts.carrier) data.carrier = opts.carrier;
    }
    if (to === 'DELIVERED') data.deliveredAt = now;
    if (to === 'CANCELLED') {
      data.cancelledAt = now;
      data.cancelReason = opts.reason ?? opts.note;
    }
    if (to === 'REFUNDED') data.paymentStatus = 'REFUNDED';
    await tx.order.update({ where: { id: orderId }, data });

    const lines = order.items.filter((i) => i.variantId).map((i) => ({ variantId: i.variantId as string, quantity: i.quantity }));
    if (to === 'PAID') {
      await this.inventory.commit(tx, storeId, { type: 'ORDER', id: orderId });
      if (order.customerId) {
        await tx.customer.update({
          where: { id: order.customerId },
          data: { ordersCount: { increment: 1 }, totalSpent: { increment: order.total }, lastOrderAt: now },
        });
      }
      for (const item of order.items) {
        if (item.productId) await tx.product.update({ where: { id: item.productId }, data: { soldCount: { increment: item.quantity } } });
      }
    }
    if (to === 'CANCELLED') {
      if (order.paidAt) await this.inventory.restock(tx, storeId, lines, { type: 'ORDER', id: orderId }, `Cancelamento do pedido ${order.number}`);
      else await this.inventory.release(tx, storeId, { type: 'ORDER', id: orderId });
      await this.marketing.releaseRedemption(tx, orderId);
      await tx.payment.updateMany({ where: { orderId, status: { in: ['PENDING', 'AUTHORIZED'] } }, data: { status: 'CANCELLED' } });
    }
    if (to === 'RETURNED') {
      await this.inventory.restock(tx, storeId, lines, { type: 'ORDER', id: orderId }, `Devolução do pedido ${order.number}`);
    }

    if (!opts.silent) {
      await this.addTimeline(tx, orderId, {
        type: 'STATUS_CHANGE',
        status: to,
        message: opts.note ?? STATUS_MESSAGES[to],
        visibleToCustomer: true,
        metadata: opts.trackingCode ? { trackingCode: opts.trackingCode, carrier: opts.carrier } : undefined,
      });
    }

    const eventByStatus: Partial<Record<OrderStatusValue, string>> = {
      PAID: EventNames.ORDER_PAID,
      CANCELLED: EventNames.ORDER_CANCELLED,
      SHIPPED: EventNames.ORDER_SHIPPED,
      DELIVERED: EventNames.ORDER_DELIVERED,
    };
    await this.outbox.enqueue(tx, {
      storeId,
      aggregateType: 'Order',
      aggregateId: orderId,
      eventName: eventByStatus[to] ?? EventNames.ORDER_STATUS_CHANGED,
      payload: { orderId, orderNumber: order.number, customerId: order.customerId, totalCents: toCents(order.total), from, to },
    });
    if (eventByStatus[to]) {
      await this.outbox.enqueue(tx, {
        storeId,
        aggregateType: 'Order',
        aggregateId: orderId,
        eventName: EventNames.ORDER_STATUS_CHANGED,
        payload: { orderId, orderNumber: order.number, from, to },
      });
    }
  }

  /** Pagamento confirmado pelo provedor (idempotente). */
  async markPaid(storeId: string, orderId: string, paymentId: string): Promise<void> {
    await this.prisma.runInTransaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId, storeId } });
      if (!order) throw new NotFoundError('Pedido não encontrado', 'ORDER_NOT_FOUND');
      if (order.status === 'CANCELLED') {
        // Pagamento chegou depois do cancelamento (ex.: PIX tardio): exige estorno manual.
        await this.addTimeline(tx, orderId, { type: 'PAYMENT', message: 'Pagamento confirmado após o cancelamento do pedido — estorno necessário', metadata: { paymentId } });
        return;
      }
      if (!['NEW', 'AWAITING_PAYMENT'].includes(order.status)) return;
      await this.transition(tx, storeId, orderId, 'PAID', { note: 'Pagamento confirmado' });
    });
  }

  async addNote(storeId: string, orderId: string, message: string, visibleToCustomer: boolean, actorId?: string): Promise<void> {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, storeId }, select: { id: true } });
    if (!order) throw new NotFoundError('Pedido não encontrado', 'ORDER_NOT_FOUND');
    await this.addTimeline(this.prisma, orderId, { type: 'NOTE', message, visibleToCustomer });
    await this.audit.record({ storeId, action: 'orders.note-added', entityType: 'Order', entityId: orderId, actorId });
  }

  async attachInvoice(storeId: string, orderId: string, invoice: { number?: string; key?: string; url?: string }): Promise<void> {
    await this.prisma.order.updateMany({ where: { id: orderId, storeId }, data: { invoiceNumber: invoice.number, invoiceKey: invoice.key, invoiceUrl: invoice.url } });
    await this.addTimeline(this.prisma, orderId, { type: 'INTEGRATION', message: `Nota fiscal ${invoice.number ?? ''} emitida`.trim(), visibleToCustomer: true });
  }

  // ── Mapeadores ──

  private toSummary(o: { id: string; number: string; status: string; paymentStatus: string; customerName: string; customerEmail: string; total: Prisma.Decimal; placedAt: Date }, itemsCount: number): OrderSummaryView {
    return {
      id: o.id,
      number: o.number,
      status: o.status,
      paymentStatus: o.paymentStatus,
      customerName: o.customerName,
      customerEmail: o.customerEmail,
      totalCents: toCents(o.total),
      itemsCount,
      placedAt: o.placedAt.toISOString(),
    };
  }

  private toDetail(o: OrderFull, internal: boolean): OrderDetailView {
    return {
      ...this.toSummary(o, o.items.reduce((a, i) => a + i.quantity, 0)),
      subtotalCents: toCents(o.subtotal),
      discountCents: toCents(o.discountTotal),
      shippingCents: toCents(o.shippingTotal),
      couponCode: o.couponCode,
      shippingMethod: o.shippingMethod,
      shippingAddress: o.shippingAddress as Record<string, unknown>,
      trackingCode: o.trackingCode,
      trackingUrl: o.trackingUrl,
      carrier: o.carrier,
      invoiceNumber: o.invoiceNumber,
      invoiceUrl: o.invoiceUrl,
      erpProvider: internal ? o.erpProvider : null,
      erpOrderId: internal ? o.erpOrderId : null,
      erpSyncStatus: internal ? o.erpSyncStatus : null,
      items: o.items.map((i) => ({
        id: i.id,
        sku: i.sku,
        name: i.name,
        variantName: i.variantName,
        imageUrl: i.imageUrl,
        quantity: i.quantity,
        unitPriceCents: toCents(i.unitPrice),
        totalCents: toCents(i.total),
      })),
      payments: o.payments.map((p) => ({
        id: p.id,
        provider: p.provider,
        method: p.method,
        status: p.status,
        amountCents: toCents(p.amount),
        installments: p.installments,
        paidAt: p.paidAt?.toISOString() ?? null,
      })),
      timeline: o.timeline
        .filter((t) => internal || t.visibleToCustomer)
        .map((t) => ({ id: t.id, type: t.type, status: t.status, message: t.message, actorType: t.actorType, visibleToCustomer: t.visibleToCustomer, createdAt: t.createdAt.toISOString() })),
      allowedTransitions: [...ORDER_TRANSITIONS[o.status as OrderStatusValue]],
    };
  }
}

const STATUS_MESSAGES: Record<OrderStatusValue, string> = {
  NEW: 'Pedido recebido',
  AWAITING_PAYMENT: 'Aguardando confirmação do pagamento',
  PAID: 'Pagamento confirmado',
  PICKING: 'Pedido em separação',
  INVOICED: 'Nota fiscal emitida',
  SHIPPED: 'Pedido enviado',
  DELIVERED: 'Pedido entregue',
  CANCELLED: 'Pedido cancelado',
  REFUNDED: 'Pedido reembolsado',
  RETURNED: 'Pedido devolvido',
};

