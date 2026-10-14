import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { brtDay, resolveRange } from './range';

// Receita conta pedidos pagos em diante; devolvidos, reembolsados e cancelados ficam de fora.
const PAID = [OrderStatus.PAID, OrderStatus.PICKING, OrderStatus.INVOICED, OrderStatus.SHIPPED, OrderStatus.DELIVERED];
const paidList = Prisma.join(PAID.map(status => Prisma.sql`${status}::"OrderStatus"`));

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async sales(storeId: string, from?: string, to?: string) {
    const { start, end } = resolveRange(from, to);
    const tz = 'America/Sao_Paulo';
    const [daily, totals, top, funnel, coupons, newCustomers] = await Promise.all([
      this.prisma.$queryRaw<{ day: string; revenue: Prisma.Decimal; orders: bigint }[]>`
        SELECT to_char(("createdAt" AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day, SUM("total") AS revenue, COUNT(*) AS orders
        FROM "Order" WHERE "storeId" = ${storeId} AND "createdAt" >= ${start} AND "createdAt" < ${end} AND "status" IN (${paidList})
        GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ revenue: Prisma.Decimal | null; orders: bigint; discount: Prisma.Decimal | null; shipping: Prisma.Decimal | null; customers: bigint }[]>`
        SELECT SUM("total") AS revenue, COUNT(*) AS orders, SUM("discount") AS discount, SUM("shipping") AS shipping, COUNT(DISTINCT "customerId") AS customers
        FROM "Order" WHERE "storeId" = ${storeId} AND "createdAt" >= ${start} AND "createdAt" < ${end} AND "status" IN (${paidList})`,
      this.prisma.$queryRaw<{ sku: string; name: string; quantity: bigint; revenue: Prisma.Decimal }[]>`
        SELECT i."sku", MAX(i."name") AS name, SUM(i."quantity") AS quantity, SUM(i."total") AS revenue
        FROM "OrderItem" i JOIN "Order" o ON o."id" = i."orderId"
        WHERE o."storeId" = ${storeId} AND o."createdAt" >= ${start} AND o."createdAt" < ${end} AND o."status" IN (${paidList})
        GROUP BY i."sku" ORDER BY revenue DESC LIMIT 10`,
      this.prisma.order.groupBy({ by: ['status'], where: { storeId, createdAt: { gte: start, lt: end } }, _count: { _all: true }, orderBy: { status: 'asc' } }),
      this.prisma.$queryRaw<{ code: string; uses: bigint; discount: Prisma.Decimal }[]>`
        SELECT "couponCode" AS code, COUNT(*) AS uses, SUM("discount") AS discount
        FROM "Order" WHERE "storeId" = ${storeId} AND "createdAt" >= ${start} AND "createdAt" < ${end} AND "status" IN (${paidList}) AND "couponCode" IS NOT NULL
        GROUP BY 1 ORDER BY uses DESC LIMIT 10`,
      this.prisma.customer.count({ where: { storeId, createdAt: { gte: start, lt: end }, anonymizedAt: null } }),
    ]);

    // Preenche os dias sem venda para o gráfico não "pular" datas.
    const byDay = new Map(daily.map(row => [row.day, row]));
    const series: { day: string; revenue: string; orders: number }[] = [];
    for (let t = start.getTime(); t < end.getTime(); t += 86_400_000) {
      const day = brtDay(new Date(t));
      const row = byDay.get(day);
      series.push({ day, revenue: (row?.revenue ?? new Prisma.Decimal(0)).toFixed(2), orders: Number(row?.orders ?? 0) });
    }
    const t = totals[0];
    const orders = Number(t?.orders ?? 0);
    const revenue = t?.revenue ?? new Prisma.Decimal(0);
    const counts = Object.fromEntries(funnel.map(row => [row.status, (row._count as { _all: number })._all]));
    const created = Object.values(counts).reduce((sum, n) => sum + n, 0);
    const reached = (...statuses: OrderStatus[]) => statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
    return {
      from: brtDay(start), to: brtDay(new Date(end.getTime() - 86_400_000)),
      totals: {
        revenue: revenue.toFixed(2), orders, averageTicket: orders ? revenue.div(orders).toFixed(2) : '0.00',
        discount: (t?.discount ?? new Prisma.Decimal(0)).toFixed(2), shipping: (t?.shipping ?? new Prisma.Decimal(0)).toFixed(2),
        buyers: Number(t?.customers ?? 0), newCustomers,
      },
      series,
      topProducts: top.map(p => ({ sku: p.sku, name: p.name, quantity: Number(p.quantity), revenue: p.revenue.toFixed(2) })),
      funnel: [
        { stage: 'Pedidos criados', count: created },
        { stage: 'Pagos', count: reached(...PAID, OrderStatus.RETURNED, OrderStatus.REFUNDED) },
        { stage: 'Enviados', count: reached(OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.RETURNED) },
        { stage: 'Entregues', count: reached(OrderStatus.DELIVERED, OrderStatus.RETURNED) },
      ],
      cancelled: counts[OrderStatus.CANCELLED] ?? 0,
      returned: counts[OrderStatus.RETURNED] ?? 0,
      coupons: coupons.map(c => ({ code: c.code, uses: Number(c.uses), discount: c.discount.toFixed(2) })),
    };
  }
}
