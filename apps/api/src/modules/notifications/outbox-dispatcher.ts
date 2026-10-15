import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { EmailStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { enqueueAutomationRuns } from '../automations/automation-enqueue';
import { MAIL_PROVIDER, MailProvider } from './mail-provider';
import { templateKeyForEvent } from './email-templates';
import { buildOrderMail } from './templates';

const MAX_ATTEMPTS = 5;
const BATCH = 20;

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
          await this.handle(tx, event);
          await tx.outboxEvent.update({ where: { id: event.id }, data: { publishedAt: new Date() } });
        } catch (error) {
          this.logger.warn(`Evento ${event.eventName} falhou: ${(error as Error).message}`);
          await tx.outboxEvent.update({ where: { id: event.id }, data: { attempts: { increment: 1 } } });
        }
      }
      return events.length;
    }, { timeout: 60_000 });
  }

  private async handle(tx: Prisma.TransactionClient, event: Claimed) {
    if (!event.eventName.startsWith('orders.')) return; // sem consumidor para os demais eventos
    await enqueueAutomationRuns(tx, event); // idempotente: a chave (regra, evento) impede disparo em dobro
    const order = await tx.order.findUnique({ where: { id: event.aggregateId }, include: { customer: true, store: { select: { name: true } }, fulfillment: true } });
    if (!order?.customer || order.customer.anonymizedAt) return;
    const payload = (event.payload ?? {}) as Record<string, string | undefined>;
    const key = templateKeyForEvent(event.eventName);
    const override = key ? await tx.emailTemplate.findUnique({ where: { storeId_key: { storeId: order.storeId, key } } }) : null;
    const message = buildOrderMail(event.eventName, {
      storeName: order.store.name, customerName: order.customer.name, orderNumber: order.number, total: order.total.toFixed(2),
      carrier: payload.carrier ?? order.fulfillment?.carrier ?? undefined, trackingCode: payload.trackingCode ?? order.fulfillment?.trackingCode ?? undefined, trackingUrl: order.fulfillment?.trackingUrl ?? undefined,
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
}
