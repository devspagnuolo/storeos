import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { averageDaysBetween, buildTimeline, daysSince, normalizeTag, TimelineEvent, toCsv } from './customer-insights';
import { AT_RISK_DAYS, classifyCustomer, Segment, SEGMENTS, VIP_ORDERS, VIP_SPENT } from './segments';

// Pedidos que contam como compra concretizada (não inclui cancelados, devolvidos nem reembolsados).
const PAID = [OrderStatus.PAID, OrderStatus.PICKING, OrderStatus.INVOICED, OrderStatus.SHIPPED, OrderStatus.DELIVERED];
const paidList = Prisma.join(PAID.map(status => Prisma.sql`${status}::"OrderStatus"`));

type Row = { id: string; name: string; email: string; tags: string[]; marketingOptIn: boolean; createdAt: Date; paid_orders: bigint; total_spent: Prisma.Decimal; last_paid_at: Date | null; segment: Segment };

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Uma consulta agrega pedidos e segmenta no banco, para a listagem escalar com muitos clientes. */
  private base(storeId: string, q?: string, tag?: string) {
    const search = q?.trim() ? Prisma.sql`AND (c."name" ILIKE ${`%${q.trim()}%`} OR c."email" ILIKE ${`%${q.trim()}%`})` : Prisma.empty;
    const tagFilter = tag ? Prisma.sql`AND ${normalizeTag(tag)} = ANY(c."tags")` : Prisma.empty;
    return Prisma.sql`
      WITH agg AS (
        SELECT c."id", c."name", c."email", c."tags", c."marketingOptIn", c."createdAt",
          COUNT(o."id") FILTER (WHERE o."status" IN (${paidList})) AS paid_orders,
          COALESCE(SUM(o."total") FILTER (WHERE o."status" IN (${paidList})), 0) AS total_spent,
          MAX(o."createdAt") FILTER (WHERE o."status" IN (${paidList})) AS last_paid_at
        FROM "Customer" c LEFT JOIN "Order" o ON o."customerId" = c."id"
        WHERE c."storeId" = ${storeId} AND c."anonymizedAt" IS NULL ${search} ${tagFilter}
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

  async list(storeId: string, { q, segment, tag, page = 1, pageSize = 20 }: { q?: string; segment?: string; tag?: string; page?: number; pageSize?: number }) {
    if (segment && !SEGMENTS.includes(segment as Segment)) throw new BadRequestException('Segmento inválido');
    const filter = segment ? Prisma.sql`WHERE segment = ${segment}` : Prisma.empty;
    const base = this.base(storeId, q, tag);
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

  /** Etiquetas em uso na loja, com a quantidade de clientes de cada uma. */
  async tags(storeId: string) {
    const rows = await this.prisma.$queryRaw<{ tag: string; total: bigint }[]>`SELECT t AS tag, COUNT(*) AS total FROM "Customer" c, unnest(c."tags") AS t WHERE c."storeId" = ${storeId} AND c."anonymizedAt" IS NULL GROUP BY t ORDER BY total DESC, t ASC LIMIT 200`;
    return rows.map(r => ({ tag: r.tag, total: Number(r.total) }));
  }

  /** Lista completa (até 20 mil) em CSV, respeitando busca, segmento e etiqueta. */
  async exportCsv(storeId: string, { q, segment, tag }: { q?: string; segment?: string; tag?: string }) {
    if (segment && !SEGMENTS.includes(segment as Segment)) throw new BadRequestException('Segmento inválido');
    const filter = segment ? Prisma.sql`WHERE segment = ${segment}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<Row[]>`${this.base(storeId, q, tag)} SELECT * FROM seg ${filter} ORDER BY total_spent DESC, "createdAt" DESC LIMIT 20000`;
    const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
    return toCsv([
      ['Nome', 'E-mail', 'Segmento', 'Pedidos pagos', 'Total gasto', 'Última compra', 'Etiquetas', 'Aceita novidades', 'Cliente desde'],
      ...rows.map(r => [r.name, r.email, r.segment, Number(r.paid_orders), r.total_spent.toFixed(2), day(r.last_paid_at), r.tags.join(', '), r.marketingOptIn ? 'Sim' : 'Não', day(r.createdAt)]),
    ]);
  }

  /** Perfil 360°: dados, indicadores de valor, categorias preferidas, anotações e linha do tempo. */
  async profile(storeId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, storeId }, include: { addresses: true, orders: { orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, number: true, status: true, total: true, couponCode: true, createdAt: true } } } });
    if (!customer) throw new NotFoundException('Cliente não encontrado');
    const anonymous = !!customer.anonymizedAt;
    const [paid, paidDates, favorites, noteRows, emails, carts, loyalty, redemptions, subscriber] = await Promise.all([
      this.prisma.order.aggregate({ where: { customerId: id, storeId, status: { in: PAID } }, _sum: { total: true }, _count: true, _max: { createdAt: true }, _min: { createdAt: true } }),
      this.prisma.order.findMany({ where: { customerId: id, storeId, status: { in: PAID } }, select: { createdAt: true }, take: 500 }),
      this.prisma.$queryRaw<{ name: string; quantity: bigint }[]>`
        SELECT cat."name" AS name, SUM(oi."quantity") AS quantity
        FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId"
        JOIN "ProductCategory" pc ON pc."productId" = oi."productId" JOIN "Category" cat ON cat."id" = pc."categoryId"
        WHERE o."customerId" = ${id} AND o."storeId" = ${storeId} AND o."status" IN (${paidList})
        GROUP BY cat."name" ORDER BY quantity DESC, cat."name" ASC LIMIT 5`,
      this.prisma.customerNote.findMany({ where: { customerId: id, storeId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      anonymous ? [] : this.prisma.emailLog.findMany({ where: { storeId, toEmail: customer.email }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, subject: true, template: true, status: true, createdAt: true } }),
      anonymous ? [] : this.prisma.abandonedCart.findMany({ where: { storeId, email: customer.email }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, itemCount: true, subtotal: true, status: true, createdAt: true } }),
      this.prisma.loyaltyEntry.findMany({ where: { customerId: id, storeId }, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.prisma.couponRedemption.findMany({ where: { customerId: id, coupon: { storeId } }, orderBy: { createdAt: 'desc' }, take: 30, include: { coupon: { select: { code: true } } } }),
      anonymous ? null : this.prisma.newsletterSubscriber.findUnique({ where: { storeId_email: { storeId, email: customer.email } } }),
    ]);
    const totalSpent = Number(paid._sum.total ?? 0);
    const stats = { paidOrders: paid._count, totalSpent, lastPaidAt: paid._max.createdAt };

    const events: TimelineEvent[] = [
      { at: customer.createdAt, kind: 'SIGNUP', title: 'Cadastro criado' },
      ...customer.orders.map(o => ({ at: o.createdAt, kind: 'ORDER' as const, title: `Pedido #${o.number}`, detail: `${o.status} · R$ ${Number(o.total).toFixed(2)}`, ref: o.number })),
      ...emails.map(e => ({ at: e.createdAt, kind: 'EMAIL' as const, title: `E-mail: ${e.subject}`, detail: e.status })),
      ...carts.map(c => ({ at: c.createdAt, kind: 'CART' as const, title: `Carrinho com ${c.itemCount} item(ns)`, detail: `R$ ${Number(c.subtotal).toFixed(2)} · ${c.status}` })),
      ...loyalty.map(l => ({ at: l.createdAt, kind: 'LOYALTY' as const, title: `Pontos: ${l.points > 0 ? '+' : ''}${l.points}`, detail: l.note ?? l.type })),
      ...redemptions.map(r => ({ at: r.createdAt, kind: 'COUPON' as const, title: `Cupom ${r.coupon.code}`, detail: `Desconto R$ ${Number(r.amount).toFixed(2)}` })),
      ...noteRows.map(n => ({ at: n.createdAt, kind: 'NOTE' as const, title: `Anotação de ${n.authorName}`, detail: n.body })),
    ];

    return {
      ...customer,
      noteEntries: noteRows,
      newsletter: subscriber ? { subscribed: !subscriber.unsubscribedAt, since: subscriber.createdAt, unsubscribedAt: subscriber.unsubscribedAt } : null,
      favoriteCategories: favorites.map(f => ({ name: f.name, quantity: Number(f.quantity) })),
      timeline: buildTimeline(events),
      stats: {
        paidOrders: paid._count, ltv: totalSpent.toFixed(2),
        averageTicket: paid._count ? (totalSpent / paid._count).toFixed(2) : '0.00',
        firstPurchaseAt: paid._min.createdAt, lastPurchaseAt: paid._max.createdAt,
        daysSinceLastPurchase: daysSince(paid._max.createdAt),
        averageDaysBetweenOrders: averageDaysBetween(paidDates.map(d => d.createdAt)),
        segment: classifyCustomer(stats),
      },
    };
  }

  async addNote(storeId: string, id: string, userId: string, body: string) {
    const text = body.trim();
    if (!text) throw new BadRequestException('Escreva a anotação');
    const [customer, user] = await Promise.all([
      this.prisma.customer.findFirst({ where: { id, storeId, anonymizedAt: null }, select: { id: true } }),
      this.prisma.user.findFirst({ where: { id: userId, storeId }, select: { name: true } }),
    ]);
    if (!customer) throw new NotFoundException('Cliente não encontrado');
    return this.prisma.customerNote.create({ data: { storeId, customerId: id, authorId: userId, authorName: user?.name ?? 'Equipe', body: text.slice(0, 2000) } });
  }

  async deleteNote(storeId: string, id: string, noteId: string) {
    const done = await this.prisma.customerNote.deleteMany({ where: { id: noteId, customerId: id, storeId } });
    if (!done.count) throw new NotFoundException('Anotação não encontrada');
    return { deleted: true };
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
      if (result.count) { await tx.address.deleteMany({ where: { customerId: id } }); await tx.customerNote.deleteMany({ where: { customerId: id } }); }
      return result.count;
    });
    if (!done) throw new NotFoundException('Cliente não encontrado ou já anonimizado');
    return { anonymized: true };
  }
}
