import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, ProductStatus } from '@prisma/client';
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
}
