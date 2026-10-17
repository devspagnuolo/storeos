import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, ProductStatus } from '@prisma/client';
import { money } from '../../shared/money/money';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { nextOrderNumber, mergeItems, persistLines, priceOrderLines, productsForPricing, RequestedItem } from './order-lines';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(storeId: string, dto: { customerId: string; items: RequestedItem[] }) {
    const items = mergeItems(dto.items);
    return this.prisma.$transaction(async tx => {
      const customer = await tx.customer.findFirst({ where: { id: dto.customerId, storeId } });
      if (!customer) throw new BadRequestException('Cliente não encontrado nesta loja');
      const products = await productsForPricing(tx, storeId, items);
      const { lines, subtotal } = priceOrderLines(items, products);
      const number = await nextOrderNumber(tx, storeId);
      const order = await tx.order.create({ data: { storeId, customerId: customer.id, number, subtotal, total: subtotal, items: { create: persistLines(lines) }, timeline: { create: { status: 'NEW', message: 'Pedido criado' } } } });
      await tx.outboxEvent.create({ data: { storeId, aggregateType: 'Order', aggregateId: order.id, eventName: 'orders.order-created.v1', payload: { orderNumber: number, total: subtotal.toString() } } });
      return order;
    });
  }

  async list(storeId: string, { page = 1, pageSize = 20, status, q }: { page?: number; pageSize?: number; status?: string; q?: string } = {}) {
    if (status && !(status in OrderStatus)) throw new BadRequestException('Status inválido');
    const search = q?.trim().slice(0, 120);
    const where: Prisma.OrderWhereInput = {
      storeId,
      ...(status && { status: status as OrderStatus }),
      ...(search && { OR: [
        { number: { contains: search, mode: 'insensitive' } },
        { customer: { is: { name: { contains: search, mode: 'insensitive' } } } },
        { customer: { is: { email: { contains: search, mode: 'insensitive' } } } },
      ] }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { customer: { select: { name: true, email: true } }, payments: { select: { method: true, status: true, provider: true } }, blingSync: { select: { status: true, blingOrderId: true, blingOrderNumber: true, blingSituationId: true, blingSituationName: true } }, _count: { select: { items: true } } } }),
      this.prisma.order.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async byNumber(storeId: string, number: string) {
    const order = await this.prisma.order.findUnique({ where: { storeId_number: { storeId, number } }, include: { items: true, payments: true, customer: true, fulfillment: true, shippingLabel: { select: { status: true, trackingCode: true, labelUrl: true, price: true, lastError: true, attempts: true, remoteStatus: true } }, timeline: { orderBy: { createdAt: 'asc' } }, blingSync: { select: { status: true, blingOrderId: true, blingOrderNumber: true, blingSituationName: true } } } });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    return order;
  }

  /** Indicadores do painel: receita e ticket médio contam só pedidos pagos ou em diante. */
  async summary(storeId: string, days = 30) {
    const since = new Date(Date.now() - days * 86_400_000);
    const paidStatuses = [OrderStatus.PAID, OrderStatus.PICKING, OrderStatus.INVOICED, OrderStatus.SHIPPED, OrderStatus.DELIVERED];
    const [paid, byStatus, lowStock] = await this.prisma.$transaction([
      this.prisma.order.aggregate({ where: { storeId, createdAt: { gte: since }, status: { in: paidStatuses } }, _sum: { total: true }, _count: true }),
      this.prisma.order.groupBy({ by: ['status'], where: { storeId, createdAt: { gte: since } }, _count: { _all: true }, orderBy: { status: 'asc' } }),
      this.prisma.inventory.count({ where: { storeId, quantity: { lte: 3 }, product: { status: ProductStatus.ACTIVE } } }),
    ]);
    const revenue = paid._sum.total ?? money(0);
    const counts = Object.fromEntries(byStatus.map(row => [row.status, (row._count as { _all: number })._all]));
    const orders = Object.values(counts).reduce((sum, n) => sum + n, 0);
    return {
      days,
      revenue: revenue.toFixed(2),
      paidOrders: paid._count,
      averageTicket: paid._count ? revenue.dividedBy(paid._count).toFixed(2) : '0.00',
      orders,
      awaitingPayment: counts[OrderStatus.AWAITING_PAYMENT] ?? 0,
      paymentRate: orders ? Math.round((paid._count / orders) * 1000) / 10 : 0,
      lowStockProducts: lowStock,
    };
  }
}
