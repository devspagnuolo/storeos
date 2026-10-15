import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { AT_RISK_DAYS, classifyCustomer, Segment, SEGMENTS, VIP_ORDERS, VIP_SPENT } from './segments';

// Pedidos que contam como compra concretizada (não inclui cancelados, devolvidos nem reembolsados).
const PAID = [OrderStatus.PAID, OrderStatus.PICKING, OrderStatus.INVOICED, OrderStatus.SHIPPED, OrderStatus.DELIVERED];
const paidList = Prisma.join(PAID.map(status => Prisma.sql`${status}::"OrderStatus"`));

type Row = { id: string; name: string; email: string; tags: string[]; marketingOptIn: boolean; createdAt: Date; paid_orders: bigint; total_spent: Prisma.Decimal; last_paid_at: Date | null; segment: Segment };

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Uma consulta agrega pedidos e segmenta no banco, para a listagem escalar com muitos clientes. */
  private base(storeId: string, q?: string) {
    const search = q?.trim() ? Prisma.sql`AND (c."name" ILIKE ${`%${q.trim()}%`} OR c."email" ILIKE ${`%${q.trim()}%`})` : Prisma.empty;
    return Prisma.sql`
      WITH agg AS (
        SELECT c."id", c."name", c."email", c."tags", c."marketingOptIn", c."createdAt",
          COUNT(o."id") FILTER (WHERE o."status" IN (${paidList})) AS paid_orders,
          COALESCE(SUM(o."total") FILTER (WHERE o."status" IN (${paidList})), 0) AS total_spent,
          MAX(o."createdAt") FILTER (WHERE o."status" IN (${paidList})) AS last_paid_at
        FROM "Customer" c LEFT JOIN "Order" o ON o."customerId" = c."id"
        WHERE c."storeId" = ${storeId} AND c."anonymizedAt" IS NULL ${search}
        GROUP BY c."id"
      ), seg AS (
        SELECT *, CASE
          WHEN paid_orders = 0 THEN 'PROSPECT'
          WHEN last_paid_at < NOW() - make_interval(days => ${AT_RISK_DAYS}::int) THEN 'AT_RISK'
          WHEN paid_orders >= ${VIP_ORDERS}::int OR total_spent >= ${VIP_SPENT}::numeric THEN 'VIP'
          WHEN paid_orders >= 2 THEN 'RECURRING' ELSE 'NEW' END AS segment
        FROM agg
      )`;
  }

  /** Clientes que aceitaram receber novidades (opt-in), opcionalmente de um segmento. */
  async marketingAudience(storeId: string, segment?: string) {
    if (segment && !SEGMENTS.includes(segment as Segment)) throw new BadRequestException('Segmento inválido');
    const filter = segment ? Prisma.sql`AND segment = ${segment}` : Prisma.empty;
    return this.prisma.$queryRaw<{ email: string; name: string }[]>`${this.base(storeId)} SELECT "email", "name" FROM seg WHERE "marketingOptIn" = true ${filter} ORDER BY "createdAt" ASC LIMIT 20000`;
  }

  async list(storeId: string, { q, segment, page = 1, pageSize = 20 }: { q?: string; segment?: string; page?: number; pageSize?: number }) {
    if (segment && !SEGMENTS.includes(segment as Segment)) throw new BadRequestException('Segmento inválido');
    const filter = segment ? Prisma.sql`WHERE segment = ${segment}` : Prisma.empty;
    const base = this.base(storeId, q);
    const [rows, count, summary] = await Promise.all([
      this.prisma.$queryRaw<Row[]>`${base} SELECT * FROM seg ${filter} ORDER BY total_spent DESC, "createdAt" DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      this.prisma.$queryRaw<{ total: bigint }[]>`${base} SELECT COUNT(*) AS total FROM seg ${filter}`,
      this.prisma.$queryRaw<{ segment: Segment; total: bigint }[]>`${base} SELECT segment, COUNT(*) AS total FROM seg GROUP BY segment`,
    ]);
    return {
      items: rows.map(r => ({ id: r.id, name: r.name, email: r.email, tags: r.tags, marketingOptIn: r.marketingOptIn, createdAt: r.createdAt, paidOrders: Number(r.paid_orders), totalSpent: r.total_spent.toFixed(2), lastPaidAt: r.last_paid_at, segment: r.segment })),
      total: Number(count[0]?.total ?? 0), page, pageSize,
      segments: Object.fromEntries(SEGMENTS.map(s => [s, Number(summary.find(x => x.segment === s)?.total ?? 0)])),
    };
  }

  /** Perfil 360°: dados, indicadores de valor e histórico de pedidos. */
  async profile(storeId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, storeId }, include: { addresses: true, orders: { orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, number: true, status: true, total: true, couponCode: true, createdAt: true } } } });
    if (!customer) throw new NotFoundException('Cliente não encontrado');
    const paid = await this.prisma.order.aggregate({ where: { customerId: id, storeId, status: { in: PAID } }, _sum: { total: true }, _count: true, _max: { createdAt: true }, _min: { createdAt: true } });
    const totalSpent = Number(paid._sum.total ?? 0);
    const stats = { paidOrders: paid._count, totalSpent, lastPaidAt: paid._max.createdAt };
    return {
      ...customer,
      stats: {
        paidOrders: paid._count, ltv: totalSpent.toFixed(2),
        averageTicket: paid._count ? (totalSpent / paid._count).toFixed(2) : '0.00',
        firstPurchaseAt: paid._min.createdAt, lastPurchaseAt: paid._max.createdAt,
        segment: classifyCustomer(stats),
      },
    };
  }

  async update(storeId: string, id: string, data: { phone?: string; notes?: string; tags?: string[]; marketingOptIn?: boolean }) {
    const tags = data.tags && [...new Set(data.tags.map(t => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
    const done = await this.prisma.customer.updateMany({ where: { id, storeId, anonymizedAt: null }, data: { ...data, ...(tags && { tags }) } });
    if (!done.count) throw new NotFoundException('Cliente não encontrado');
    return this.profile(storeId, id);
  }

  /** LGPD: remove os dados pessoais mantendo os pedidos (obrigação fiscal) ligados a um cadastro anônimo. */
  async anonymize(storeId: string, id: string) {
    const done = await this.prisma.$transaction(async tx => {
      const result = await tx.customer.updateMany({ where: { id, storeId, anonymizedAt: null }, data: { name: 'Cliente anonimizado', email: `anonimo-${id}@removido.invalid`, phone: null, notes: null, tags: [], marketingOptIn: false, anonymizedAt: new Date() } });
      if (result.count) await tx.address.deleteMany({ where: { customerId: id } });
      return result.count;
    });
    if (!done) throw new NotFoundException('Cliente não encontrado ou já anonimizado');
    return { anonymized: true };
  }
}
