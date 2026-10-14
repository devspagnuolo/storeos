import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, ProductStatus } from '@prisma/client';
import { money } from '../../shared/money/money';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { generateOrderNumber, mergeItems, priceOrderLines, RequestedItem } from './order-lines';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(storeId: string, dto: { customerId: string; items: RequestedItem[] }) {
    const items = mergeItems(dto.items);
    return this.prisma.$transaction(async tx => {
      const customer = await tx.customer.findFirst({ where: { id: dto.customerId, storeId } });
      if (!customer) throw new BadRequestException('Cliente não encontrado nesta loja');
      const products = await tx.product.findMany({ where: { storeId, id: { in: items.map(i => i.productId) }, status: ProductStatus.ACTIVE } });
      const { lines, subtotal } = priceOrderLines(items, products);
      const number = generateOrderNumber();
      const order = await tx.order.create({ data: { storeId, customerId: customer.id, number, subtotal, total: subtotal, items: { create: lines }, timeline: { create: { status: 'NEW', message: 'Pedido criado' } } } });
      await tx.outboxEvent.create({ data: { storeId, aggregateType: 'Order', aggregateId: order.id, eventName: 'orders.order-created.v1', payload: { orderNumber: number, total: subtotal.toString() } } });
      return order;
    });
  }

  async list(storeId: string, { page = 1, pageSize = 20, status }: { page?: number; pageSize?: number; status?: string } = {}) {
    if (status && !(status in OrderStatus)) throw new BadRequestException('Status inválido');
    const where = { storeId, ...(status && { status: status as OrderStatus }) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { customer: { select: { name: true, email: true } }, payments: { select: { method: true, status: true, provider: true } }, _count: { select: { items: true } } } }),
      this.prisma.order.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async byNumber(storeId: string, number: string) {
    const order = await this.prisma.order.findUnique({ where: { storeId_number: { storeId, number } }, include: { items: true, payments: true, customer: true, timeline: { orderBy: { createdAt: 'asc' } } } });
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
      this.prisma.inventory.count({ where: { storeId, variantId: null, quantity: { lte: 3 }, product: { status: ProductStatus.ACTIVE } } }),
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
