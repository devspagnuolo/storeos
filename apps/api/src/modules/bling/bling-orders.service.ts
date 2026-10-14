import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { BlingSyncStatus } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { BlingAuthService } from './bling-auth.service';
import { contactPayload, OrderForBling, salesOrderPayload } from './bling-mapper';
import { BlingClient } from './bling.client';

const MAX_ATTEMPTS = 6;
const BATCH = 5;

type Listing<T> = { data?: T[] };

/** Envia ao Bling cada pedido do site já pago. O pedido nunca é perdido: falhas ficam registradas e são repetidas com espera crescente. */
@Injectable()
export class BlingOrdersService {
  private readonly logger = new Logger(BlingOrdersService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly auth: BlingAuthService, private readonly client: BlingClient) {}

  @Interval(20_000)
  async tick() {
    if (this.running || process.env.OUTBOX_WORKER === 'off' || process.env.BLING_WORKER === 'off') return;
    this.running = true;
    try {
      await this.processDue();
    } catch (error) {
      this.logger.error('Falha ao enviar pedidos ao Bling', error as Error);
    } finally {
      this.running = false;
    }
  }

  /** Cria a fila: pedidos pagos (ou além) feitos depois da conexão que ainda não têm registro de envio. */
  async enqueueNew() {
    return this.prisma.$executeRaw`
      INSERT INTO "BlingOrderSync" ("id", "storeId", "orderId", "status", "attempts", "nextAttemptAt", "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, o."storeId", o."id", 'PENDING', 0, NOW(), NOW(), NOW()
      FROM "Order" o JOIN "BlingConnection" c ON c."storeId" = o."storeId"
      WHERE o."status" NOT IN ('NEW', 'AWAITING_PAYMENT', 'CANCELLED') AND o."createdAt" >= c."connectedAt"
        AND NOT EXISTS (SELECT 1 FROM "BlingOrderSync" s WHERE s."orderId" = o."id")
      LIMIT 50
      ON CONFLICT ("orderId") DO NOTHING`;
  }

  async processDue() {
    await this.enqueueNew();
    const due = await this.prisma.blingOrderSync.findMany({ where: { status: { in: [BlingSyncStatus.PENDING, BlingSyncStatus.FAILED] }, attempts: { lt: MAX_ATTEMPTS }, nextAttemptAt: { lte: new Date() } }, orderBy: { createdAt: 'asc' }, take: BATCH });
    for (const sync of due) await this.send(sync.id);
    return due.length;
  }

  async list(storeId: string, status?: BlingSyncStatus) {
    const rows = await this.prisma.blingOrderSync.findMany({ where: { storeId, ...(status && { status }) }, orderBy: { createdAt: 'desc' }, take: 100, include: { order: { select: { number: true, total: true, status: true } } } });
    const counts = await this.prisma.blingOrderSync.groupBy({ by: ['status'], where: { storeId }, _count: true });
    return { items: rows.map(({ order, ...row }) => ({ ...row, orderNumber: order.number, total: order.total.toFixed(2), orderStatus: order.status })), counts: Object.fromEntries(counts.map(c => [c.status, c._count])) };
  }

  /** Reenvio manual: zera as tentativas e envia na hora (ou cria o registro, se o pedido nunca entrou na fila). */
  async resend(storeId: string, orderNumber: string) {
    const order = await this.prisma.order.findFirst({ where: { storeId, number: orderNumber }, select: { id: true } });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    const sync = await this.prisma.blingOrderSync.upsert({ where: { orderId: order.id }, create: { storeId, orderId: order.id }, update: { status: BlingSyncStatus.PENDING, attempts: 0, nextAttemptAt: new Date(), lastError: null } });
    return this.send(sync.id);
  }

  async send(syncId: string) {
    const sync = await this.prisma.blingOrderSync.findUniqueOrThrow({ where: { id: syncId } });
    if (sync.status === BlingSyncStatus.SENT) return sync;
    try {
      const blingOrderId = await this.export(sync.storeId, sync.orderId);
      return await this.prisma.blingOrderSync.update({ where: { id: sync.id }, data: { status: BlingSyncStatus.SENT, blingOrderId: String(blingOrderId), sentAt: new Date(), lastError: null } });
    } catch (error) {
      const attempts = sync.attempts + 1;
      const message = (error as Error).message.slice(0, 500);
      this.logger.warn(`Pedido ${sync.orderId} não foi ao Bling (tentativa ${attempts}): ${message}`);
      // Espera 2, 4, 8… minutos entre tentativas, no máximo 6 horas.
      const delay = Math.min(2 ** attempts * 60_000, 6 * 3_600_000);
      return this.prisma.blingOrderSync.update({ where: { id: sync.id }, data: { status: BlingSyncStatus.FAILED, attempts, lastError: message, nextAttemptAt: new Date(Date.now() + delay) } });
    }
  }

  /** Contato (por CPF ou e-mail) → produtos por SKU → pedido de venda. Antes de criar, confere se o Bling já tem o pedido (evita duplicar após timeout). */
  private async export(storeId: string, orderId: string): Promise<number> {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { customer: true, items: true, payments: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    if (!order.customer) throw new Error('Pedido sem cliente');
    const token = await this.auth.accessToken(storeId);
    const call = <T>(path: string, init?: { method?: string; body?: unknown }) => this.client.request<T>(token, path, init);

    const existing = (await call<Listing<{ id: number }>>(`/pedidos/vendas?${new URLSearchParams({ 'numerosLojas[]': order.number })}`)).data?.[0];
    if (existing) return existing.id;

    const data: OrderForBling = {
      number: order.number, createdAt: order.createdAt, subtotal: Number(order.subtotal), discount: Number(order.discount), promotionDiscount: Number(order.promotionDiscount), shipping: Number(order.shipping), total: Number(order.total),
      shippingMethod: order.shippingMethod, couponCode: order.couponCode, paymentMethod: order.payments[0]?.method ?? null, address: order.shippingAddress as OrderForBling['address'],
      customer: { name: order.customer.name, email: order.customer.email, document: order.customer.document, phone: order.customer.phone },
      items: order.items.map(i => ({ sku: i.sku, name: i.name, quantity: i.quantity, unitPrice: Number(i.unitPrice) })),
    };

    const document = order.customer.document?.replace(/\D/g, '');
    const search: Record<string, string> = document ? { 'numeroDocumento': document } : { pesquisa: order.customer.email };
    let contactId = (await call<Listing<{ id: number }>>(`/contatos?${new URLSearchParams({ ...search, limite: '1' })}`)).data?.[0]?.id;
    contactId ??= (await call<{ data: { id: number } }>('/contatos', { method: 'POST', body: contactPayload(data) })).data.id;

    const skus = [...new Set(order.items.map(i => i.sku))];
    const found = (await call<Listing<{ id: number; codigo?: string }>>(`/produtos?${new URLSearchParams([...skus.map(sku => ['codigos[]', sku]), ['limite', '100']])}`)).data ?? [];
    const productIds = new Map(found.filter(p => p.codigo).map(p => [p.codigo!.toLowerCase(), p.id]));

    return (await call<{ data: { id: number } }>('/pedidos/vendas', { method: 'POST', body: salesOrderPayload(data, contactId, productIds) })).data.id;
  }
}
