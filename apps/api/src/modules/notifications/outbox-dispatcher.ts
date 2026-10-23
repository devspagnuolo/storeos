import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { EmailStatus, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { enqueueAutomationRuns } from '../automations/automation-enqueue';
import { MAIL_PROVIDER, MailProvider } from './mail-provider';
import { templateKeyForEvent } from './email-templates';
import { buildOrderMail } from './templates';

const MAX_ATTEMPTS = 5;
const BATCH = 20;
// Enquanto o checkout ainda está gerando a cobrança, o "pedido recebido" espera: se o cartão for recusado, ele nem sai.
const CHARGE_WAIT_MS = 2 * 60_000;

const str = (value: unknown) => (typeof value === 'string' ? value : undefined);

type Claimed = { id: string; storeId: string; aggregateId: string; eventName: string; payload: Prisma.JsonValue };

/**
 * Consome o outbox transacional: para cada evento de pedido, envia o e-mail ao cliente e registra o resultado.
 * `FOR UPDATE SKIP LOCKED` permite várias instâncias da API sem enviar o mesmo e-mail duas vezes.
 */
@Injectable()
export class OutboxDispatcher {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private running = false;

  constructor(private readonly prisma: PrismaService, @Inject(MAIL_PROVIDER) private readonly mail: MailProvider) {}

  @Interval(10_000)
  async tick() {
    if (this.running || process.env.OUTBOX_WORKER === 'off') return;
    this.running = true;
    try {
      const handled = await this.dispatchOnce();
      if (handled) this.logger.log(`${handled} evento(s) do outbox processado(s)`);
    } catch (error) {
      this.logger.error('Falha ao processar o outbox', error as Error);
    } finally {
      this.running = false;
    }
  }

  async dispatchOnce(): Promise<number> {
    return this.prisma.$transaction(async tx => {
      const events = await tx.$queryRaw<Claimed[]>`
        SELECT "id", "storeId", "aggregateId", "eventName", "payload" FROM "OutboxEvent"
        WHERE "publishedAt" IS NULL AND "attempts" < ${MAX_ATTEMPTS}
        ORDER BY "occurredAt" ASC LIMIT ${BATCH} FOR UPDATE SKIP LOCKED`;
      for (const event of events) {
        try {
          if ((await this.handle(tx, event)) === 'later') continue;
          await tx.outboxEvent.update({ where: { id: event.id }, data: { publishedAt: new Date() } });
        } catch (error) {
          this.logger.warn(`Evento ${event.eventName} falhou: ${(error as Error).message}`);
          await tx.outboxEvent.update({ where: { id: event.id }, data: { attempts: { increment: 1 } } });
        }
      }
      return events.length;
    }, { timeout: 60_000 });
  }

  /** Devolve 'later' quando o evento deve ficar para a próxima rodada sem contar como falha. */
  private async handle(tx: Prisma.TransactionClient, event: Claimed): Promise<'later' | void> {
    if (!event.eventName.startsWith('orders.')) return; // sem consumidor para os demais eventos
    const payload = (event.payload ?? {}) as Record<string, string | boolean | undefined>;
    if (event.eventName === 'orders.order-created.v1') {
      const order = await tx.order.findUnique({ where: { id: event.aggregateId }, select: { status: true, createdAt: true, payments: { select: { provider: true } } } });
      const charging = order?.status === OrderStatus.AWAITING_PAYMENT && order.payments.some(p => p.provider === 'pending');
      if (charging && Date.now() - order.createdAt.getTime() < CHARGE_WAIT_MS) return 'later';
    }
    await enqueueAutomationRuns(tx, event); // idempotente: a chave (regra, evento) impede disparo em dobro
    const order = await tx.order.findUnique({ where: { id: event.aggregateId }, include: { customer: true, store: { select: { name: true } }, fulfillment: true, items: { select: { name: true, quantity: true } } } });
    if (!order?.customer || order.customer.anonymizedAt) return;
    // Cobrança recusada ainda no checkout: o cliente viu o erro na tela e não deve receber "pedido recebido" nem "cancelado".
    if (payload.atCheckout === true) return;
    if (event.eventName === 'orders.order-created.v1' && order.status === OrderStatus.CANCELLED && await this.cancelledAtCheckout(tx, order.id)) return;
    const key = templateKeyForEvent(event.eventName);
    const override = key ? await tx.emailTemplate.findUnique({ where: { storeId_key: { storeId: order.storeId, key } } }) : null;
    const message = buildOrderMail(event.eventName, {
      storeName: order.store.name, customerName: order.customer.name, orderNumber: order.number, total: order.total.toFixed(2),
      carrier: str(payload.carrier) ?? order.fulfillment?.carrier ?? undefined, trackingCode: str(payload.trackingCode) ?? order.fulfillment?.trackingCode ?? undefined, trackingUrl: order.fulfillment?.trackingUrl ?? undefined,
      items: order.items, siteUrl: (await this.siteUrl(tx, order.storeId)) ?? undefined,
    }, override);
    if (!message) return;
    const from = process.env.MAIL_FROM ?? `${order.store.name} <pedidos@example.com>`;
    let status: EmailStatus = EmailStatus.SENT; let providerId: string | undefined; let error: string | undefined;
    try {
      const result = await this.mail.send({ to: order.customer.email, subject: message.subject, text: message.text, html: message.html, from });
      status = result.status; providerId = result.providerId;
    } catch (cause) {
      status = EmailStatus.FAILED; error = (cause as Error).message;
    }
    await tx.emailLog.create({ data: { storeId: order.storeId, eventId: event.id, template: message.template, toEmail: order.customer.email, subject: message.subject, body: message.text, status, error, providerId } });
    // Falha do provedor: repete o evento (até o limite) em vez de perder o e-mail.
    if (status === EmailStatus.FAILED) throw new Error(error);
  }

  private async cancelledAtCheckout(tx: Prisma.TransactionClient, orderId: string) {
    const cancel = await tx.outboxEvent.findFirst({ where: { aggregateId: orderId, eventName: 'orders.order-cancelled.v1', payload: { path: ['atCheckout'], equals: true } }, select: { id: true } });
    return Boolean(cancel);
  }

  /** Endereço público da loja para os links do e-mail: domínio próprio ativo, senão PUBLIC_SITE_URL. */
  private async siteUrl(tx: Prisma.TransactionClient, storeId: string): Promise<string | null> {
    const domain = await tx.storeDomain.findFirst({ where: { storeId, status: 'ACTIVE' }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] });
    if (domain) return `https://${domain.hostname}`;
    const fallback = process.env.PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
    return fallback ? fallback.replace(/\/$/, '') : null;
  }
}
