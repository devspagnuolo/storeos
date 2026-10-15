import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { toCsv } from '../inventory/stock-ledger';
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
    const span = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - span);
    const [daily, totals, top, funnel, coupons, newCustomers, previous, byPayment, byState, byCategory, buyerKinds] = await Promise.all([
      this.prisma.$queryRaw<{ day: string; revenue: Prisma.Decimal; orders: bigint }[]>`
        -- createdAt é timestamp sem fuso (UTC): converte para UTC antes de ir ao horário de Brasília.
        SELECT to_char((("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day, SUM("total") AS revenue, COUNT(*) AS orders
        FROM "Order" WHERE "storeId" = ${storeId} AND "createdAt" >= ${start} AND "createdAt" < ${end} AND "status" IN (${paidList})
        GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ revenue: Prisma.Decimal | null; orders: bigint; discount: Prisma.Decimal | null; shipping: Prisma.Decimal | null; customers: bigint }[]>`
        SELECT SUM("total") AS revenue, COUNT(*) AS orders, SUM("discount" + "promotionDiscount") AS discount, SUM("shipping") AS shipping, COUNT(DISTINCT "customerId") AS customers
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
      this.prisma.$queryRaw<{ revenue: Prisma.Decimal | null; orders: bigint }[]>`
        SELECT SUM("total") AS revenue, COUNT(*) AS orders FROM "Order"
        WHERE "storeId" = ${storeId} AND "createdAt" >= ${prevStart} AND "createdAt" < ${start} AND "status" IN (${paidList})`,
      this.prisma.$queryRaw<{ method: string; orders: bigint; revenue: Prisma.Decimal }[]>`
        SELECT COALESCE(p."method"::text, 'OUTRO') AS method, COUNT(*) AS orders, SUM(o."total") AS revenue
        FROM "Order" o LEFT JOIN LATERAL (SELECT "method" FROM "Payment" WHERE "orderId" = o."id" AND "status" = 'PAID' ORDER BY "createdAt" DESC LIMIT 1) p ON true
        WHERE o."storeId" = ${storeId} AND o."createdAt" >= ${start} AND o."createdAt" < ${end} AND o."status" IN (${paidList})
        GROUP BY 1 ORDER BY revenue DESC`,
      this.prisma.$queryRaw<{ state: string; orders: bigint; revenue: Prisma.Decimal }[]>`
        SELECT UPPER(COALESCE(NULLIF(TRIM("shippingAddress"->>'state'), ''), '—')) AS state, COUNT(*) AS orders, SUM("total") AS revenue
        FROM "Order" WHERE "storeId" = ${storeId} AND "createdAt" >= ${start} AND "createdAt" < ${end} AND "status" IN (${paidList})
        GROUP BY 1 ORDER BY revenue DESC LIMIT 12`,
      this.prisma.$queryRaw<{ name: string; quantity: bigint; revenue: Prisma.Decimal }[]>`
        SELECT c."name", SUM(i."quantity") AS quantity, SUM(i."total") AS revenue
        FROM "OrderItem" i JOIN "Order" o ON o."id" = i."orderId"
        JOIN "ProductCategory" pc ON pc."productId" = i."productId" JOIN "Category" c ON c."id" = pc."categoryId"
        WHERE o."storeId" = ${storeId} AND o."createdAt" >= ${start} AND o."createdAt" < ${end} AND o."status" IN (${paidList})
        GROUP BY c."id", c."name" ORDER BY revenue DESC LIMIT 10`,
      this.prisma.$queryRaw<{ first_time: bigint; returning: bigint }[]>`
        WITH firsts AS (SELECT "customerId", MIN("createdAt") AS first_at FROM "Order" WHERE "storeId" = ${storeId} AND "status" IN (${paidList}) GROUP BY "customerId"),
        buyers AS (SELECT DISTINCT "customerId" FROM "Order" WHERE "storeId" = ${storeId} AND "createdAt" >= ${start} AND "createdAt" < ${end} AND "status" IN (${paidList}))
        SELECT COUNT(*) FILTER (WHERE f.first_at >= ${start}) AS first_time, COUNT(*) FILTER (WHERE f.first_at < ${start}) AS returning
        FROM buyers b JOIN firsts f ON f."customerId" = b."customerId"`,
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
      previous: (() => {
        const p = previous[0]; const prevOrders = Number(p?.orders ?? 0); const prevRevenue = p?.revenue ?? new Prisma.Decimal(0);
        return { from: brtDay(prevStart), to: brtDay(new Date(start.getTime() - 86_400_000)), revenue: prevRevenue.toFixed(2), orders: prevOrders, averageTicket: prevOrders ? prevRevenue.div(prevOrders).toFixed(2) : '0.00' };
      })(),
      byPayment: byPayment.map(r => ({ method: r.method, orders: Number(r.orders), revenue: r.revenue.toFixed(2) })),
      byState: byState.map(r => ({ state: r.state, orders: Number(r.orders), revenue: r.revenue.toFixed(2) })),
      byCategory: byCategory.map(r => ({ name: r.name, quantity: Number(r.quantity), revenue: r.revenue.toFixed(2) })),
      buyerKinds: { firstTime: Number(buyerKinds[0]?.first_time ?? 0), returning: Number(buyerKinds[0]?.returning ?? 0) },
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

  /** Planilha de pedidos do período (todos os status), no horário de Brasília. */
  async ordersCsv(storeId: string, from?: string, to?: string) {
    const { start, end } = resolveRange(from, to);
    const orders = await this.prisma.order.findMany({
      where: { storeId, createdAt: { gte: start, lt: end } }, orderBy: { createdAt: 'asc' }, take: 20_000,
      include: { customer: { select: { name: true, email: true } }, items: { select: { quantity: true } }, payments: { where: { status: 'PAID' }, select: { method: true }, take: 1 } },
    });
    const when = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().replace('T', ' ').slice(0, 16);
    const addr = (o: { shippingAddress: unknown }) => (o.shippingAddress ?? {}) as { city?: string; state?: string; zipCode?: string };
    return toCsv([
      ['Pedido', 'Data', 'Situação', 'Cliente', 'E-mail', 'Itens', 'Subtotal', 'Desconto', 'Frete', 'Total', 'Cupom', 'Pagamento', 'Cidade', 'UF', 'CEP'],
      ...orders.map(o => [o.number, when(o.createdAt), o.status, o.customer?.name ?? '', o.customer?.email ?? '', o.items.reduce((n, i) => n + i.quantity, 0), o.subtotal.toFixed(2), o.discount.plus(o.promotionDiscount).toFixed(2), o.shipping.toFixed(2), o.total.toFixed(2), o.couponCode ?? '', o.payments[0]?.method ?? '', addr(o).city ?? '', addr(o).state ?? '', addr(o).zipCode ?? '']),
    ]);
  }
}
