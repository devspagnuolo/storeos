import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { BlingSyncStatus, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { BlingAuthService } from './bling-auth.service';
import { contactPayload, OrderForBling, salesOrderPayload } from './bling-mapper';
import { BlingApiError, BlingClient } from './bling.client';

const MAX_ATTEMPTS = 6;
const BATCH = 5;
const LEASE_MS = 5 * 60_000;

type Listing<T> = { data?: T[] };

/** Só pedido com pagamento aprovado vai ao Bling; antes disso ele pode nem virar venda. */
export const SENDABLE_STATUSES: OrderStatus[] = [OrderStatus.PAID, OrderStatus.PICKING, OrderStatus.INVOICED, OrderStatus.SHIPPED, OrderStatus.DELIVERED];
/** Pedido cancelado ou reembolsado na loja é cancelado também no Bling. */
export const VOIDED_STATUSES: OrderStatus[] = [OrderStatus.CANCELLED, OrderStatus.REFUNDED];
/** "Cancelado" é a situação padrão 12 do módulo de vendas do Bling; BLING_CANCELLED_SITUATION_ID troca, se a conta usar outra. */
const cancelledSituationId = () => process.env.BLING_CANCELLED_SITUATION_ID?.trim() || '12';
const CANCEL_RETRY_MS = 10 * 60_000;

/** Envia todos os pedidos da loja ao Bling; falhas ficam registradas e são repetidas com espera crescente. */
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

  /** Inclui pedidos novos e históricos já pagos; cada pedido local é enviado uma única vez. */
  async enqueueNew() {
    return this.prisma.$executeRaw`
      INSERT INTO "BlingOrderSync" ("id", "storeId", "orderId", "status", "attempts", "nextAttemptAt", "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, o."storeId", o."id", 'PENDING', 0, NOW(), NOW(), NOW()
      FROM "Order" o JOIN "BlingConnection" c ON c."storeId" = o."storeId"
      WHERE o."status" IN ('PAID', 'PICKING', 'INVOICED', 'SHIPPED', 'DELIVERED')
        AND NOT EXISTS (SELECT 1 FROM "BlingOrderSync" s WHERE s."orderId" = o."id")
      ORDER BY o."createdAt" ASC
      LIMIT 50
      ON CONFLICT ("orderId") DO NOTHING`;
  }

  async processDue() {
    // Pedido que deixou de estar pago antes de ir ao Bling (cancelado, recusado) sai da fila sem ser enviado.
    await this.prisma.blingOrderSync.deleteMany({ where: { status: { not: BlingSyncStatus.SENT }, order: { status: { notIn: SENDABLE_STATUSES } } } });
    await this.enqueueNew();
    const due = await this.prisma.blingOrderSync.findMany({
      where: { status: { in: [BlingSyncStatus.PENDING, BlingSyncStatus.FAILED, BlingSyncStatus.PROCESSING] }, attempts: { lt: MAX_ATTEMPTS }, nextAttemptAt: { lte: new Date() } },
      orderBy: { createdAt: 'asc' },
      take: BATCH,
    });
    for (const sync of due) await this.send(sync.id);
    await this.cancelVoided();
    return due.length;
  }

  /** Pedidos já no Bling que foram cancelados ou reembolsados na loja passam para a situação "Cancelado" lá. */
  async cancelVoided() {
    const situationId = cancelledSituationId();
    const rows = await this.prisma.blingOrderSync.findMany({
      where: {
        status: BlingSyncStatus.SENT,
        blingOrderId: { not: null },
        OR: [{ blingSituationId: null }, { blingSituationId: { not: situationId } }],
        nextAttemptAt: { lte: new Date() },
        order: { status: { in: VOIDED_STATUSES } },
      },
      orderBy: { updatedAt: 'asc' },
      take: BATCH,
    });
    for (const row of rows) {
      try {
        const token = await this.auth.accessToken(row.storeId);
        const path = `/pedidos/vendas/${encodeURIComponent(row.blingOrderId!)}`;
        try {
          await this.client.request(token, `${path}/situacoes/${encodeURIComponent(situationId)}`, { method: 'PATCH' });
        } catch (error) {
          if (!(error instanceof BlingApiError) || error.status !== 404) throw error;
          // 404 vem quando o pedido já está nessa situação ou foi excluído no Bling: confere antes de insistir.
          const current = await this.client.request<{ data?: { situacao?: { id?: number | string } } }>(token, path).catch((lookup: unknown) => {
            if (lookup instanceof BlingApiError && lookup.status === 404) return null;
            throw lookup;
          });
          if (current && String(current.data?.situacao?.id ?? '') !== situationId) throw error;
          if (!current) {
            await this.prisma.blingOrderSync.update({ where: { id: row.id }, data: { blingSituationId: situationId, blingSituationName: 'Excluído no Bling', lastError: null } });
            continue;
          }
        }
        await this.prisma.blingOrderSync.update({ where: { id: row.id }, data: { blingSituationId: situationId, blingSituationName: 'Cancelado', lastError: null } });
      } catch (error) {
        const message = (error as Error).message.slice(0, 500);
        this.logger.warn('Pedido ' + row.orderId + ' não foi cancelado no Bling: ' + message);
        await this.prisma.blingOrderSync.update({ where: { id: row.id }, data: { lastError: 'Cancelar no Bling: ' + message, nextAttemptAt: new Date(Date.now() + CANCEL_RETRY_MS) } });
      }
    }
    return rows.length;
  }

  async list(storeId: string, status?: BlingSyncStatus) {
    const rows = await this.prisma.blingOrderSync.findMany({
      where: { storeId, ...(status && { status }) },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { order: { select: { number: true, total: true, status: true } } },
    });
    const counts = await this.prisma.blingOrderSync.groupBy({ by: ['status'], where: { storeId }, _count: true });
    return {
      items: rows.map(({ order, ...row }) => ({ ...row, orderNumber: order.number, total: order.total.toFixed(2), orderStatus: order.status })),
      counts: Object.fromEntries(counts.map(c => [c.status, c._count])),
    };
  }

  /** Reenvio manual: zera as tentativas e envia na hora (ou cria o registro, se o pedido nunca entrou na fila). */
  async resend(storeId: string, orderNumber: string) {
    const order = await this.prisma.order.findFirst({ where: { storeId, number: orderNumber }, select: { id: true, status: true } });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    if (!SENDABLE_STATUSES.includes(order.status)) throw new BadRequestException('Só pedidos com pagamento aprovado vão para o Bling.');
    const sync = await this.prisma.blingOrderSync.upsert({
      where: { orderId: order.id },
      create: { storeId, orderId: order.id },
      update: { status: BlingSyncStatus.PENDING, attempts: 0, nextAttemptAt: new Date(), lastError: null },
    });
    return this.send(sync.id);
  }

  async send(syncId: string) {
    const now = new Date();
    // Lease persistido no banco evita que instâncias concorrentes enviem o mesmo pedido simultaneamente.
    const claimed = await this.prisma.blingOrderSync.updateMany({
      where: {
        id: syncId,
        status: { in: [BlingSyncStatus.PENDING, BlingSyncStatus.FAILED, BlingSyncStatus.PROCESSING] },
        attempts: { lt: MAX_ATTEMPTS },
        nextAttemptAt: { lte: now },
      },
      data: { status: BlingSyncStatus.PROCESSING, nextAttemptAt: new Date(now.getTime() + LEASE_MS) },
    });
    if (!claimed.count) return this.prisma.blingOrderSync.findUniqueOrThrow({ where: { id: syncId } });
    const sync = await this.prisma.blingOrderSync.findUniqueOrThrow({ where: { id: syncId }, include: { order: { select: { status: true } } } });
    if (!SENDABLE_STATUSES.includes(sync.order.status)) {
      // Cancelado entre entrar na fila e ser enviado: não vira venda no Bling.
      await this.prisma.blingOrderSync.delete({ where: { id: sync.id } });
      return null;
    }
    try {
      const remote = await this.export(sync.storeId, sync.orderId);
      return await this.prisma.blingOrderSync.update({
        where: { id: sync.id },
        data: {
          status: BlingSyncStatus.SENT,
          blingOrderId: String(remote.id),
          blingOrderNumber: remote.number,
          sentAt: new Date(),
          lastError: null,
          nextAttemptAt: new Date(),
        },
      });
    } catch (error) {
      const attempts = sync.attempts + 1;
      const message = (error as Error).message.slice(0, 500);
      this.logger.warn('Pedido ' + sync.orderId + ' não foi ao Bling (tentativa ' + attempts + '): ' + message);
      // Espera 2, 4, 8… minutos entre tentativas, no máximo 6 horas.
      const delay = Math.min(2 ** attempts * 60_000, 6 * 3_600_000);
      return this.prisma.blingOrderSync.update({
        where: { id: sync.id },
        data: { status: BlingSyncStatus.FAILED, attempts, lastError: message, nextAttemptAt: new Date(Date.now() + delay) },
      });
    }
  }

  /** O numeroLoja do Bling contém o número STOREOS e permite recuperar a criação após timeout sem duplicar. */
  private async export(storeId: string, orderId: string): Promise<{ id: number; number: string | null }> {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { customer: true, items: true, payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!order.customer) throw new Error('Pedido sem cliente');
    const token = await this.auth.accessToken(storeId);
    const call = <T>(path: string, init?: { method?: string; body?: unknown }) => this.client.request<T>(token, path, init);

    const existing = (await call<Listing<{ id: number; numero?: number | string }>>('/pedidos/vendas?' + new URLSearchParams({ 'numerosLojas[]': order.number }))).data?.[0];
    if (existing) return { id: existing.id, number: existing.numero === undefined ? null : String(existing.numero) };

    const data: OrderForBling = {
      number: order.number,
      createdAt: order.createdAt,
      subtotal: Number(order.subtotal),
      discount: Number(order.discount),
      promotionDiscount: Number(order.promotionDiscount),
      shipping: Number(order.shipping),
      total: Number(order.total),
      shippingMethod: order.shippingMethod,
      couponCode: order.couponCode,
      paymentMethod: order.payments[0]?.method ?? null,
      address: order.shippingAddress as OrderForBling['address'],
      customer: { name: order.customer.name, email: order.customer.email, document: order.customer.document, phone: order.customer.phone },
      items: order.items.map(i => ({ sku: i.sku, name: i.name, quantity: i.quantity, unitPrice: Number(i.unitPrice) })),
    };

    const document = order.customer.document?.replace(/\D/g, '');
    const search: Record<string, string> = document ? { numeroDocumento: document } : { pesquisa: order.customer.email };
    let contactId = (await call<Listing<{ id: number }>>('/contatos?' + new URLSearchParams({ ...search, limite: '1' }))).data?.[0]?.id;
    contactId ??= (await call<{ data: { id: number } }>('/contatos', { method: 'POST', body: contactPayload(data) })).data.id;

    const skus = [...new Set(order.items.map(i => i.sku))];
    const found = (await call<Listing<{ id: number; codigo?: string }>>('/produtos?' + new URLSearchParams([...skus.map(sku => ['codigos[]', sku]), ['limite', '100']]))).data ?? [];
    const productIds = new Map(found.filter(p => p.codigo).map(p => [p.codigo!.toLowerCase(), p.id]));

    const created = (await call<{ data: { id: number; numero?: number | string } }>('/pedidos/vendas', {
      method: 'POST',
      body: salesOrderPayload(data, contactId, productIds),
    })).data;
    let remoteNumber = created.numero;
    if (remoteNumber === undefined || remoteNumber === null) {
      const detail = await call<{ data: { numero?: number | string } }>('/pedidos/vendas/' + created.id);
      remoteNumber = detail.data.numero;
    }
    return { id: created.id, number: remoteNumber === undefined || remoteNumber === null ? null : String(remoteNumber) };
  }
}
