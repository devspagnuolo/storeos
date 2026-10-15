import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { BlingSyncStatus, BlingWebhookStatus, Prisma } from '@prisma/client';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { BlingAuthService } from './bling-auth.service';
import { BlingClient } from './bling.client';

export type BlingWebhookPayload = {
  eventId?: string;
  date?: string;
  version?: string;
  event?: string;
  companyId?: string | number;
  data?: {
    id?: string | number;
    numero?: string | number;
    numeroLoja?: string;
    situacao?: { id?: string | number; valor?: string | number };
  };
};

/** Valida a assinatura e persiste uma caixa de entrada idempotente antes do ACK. */
@Injectable()
export class BlingWebhookService {
  private readonly logger = new Logger(BlingWebhookService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly auth: BlingAuthService, private readonly client: BlingClient) {}

  async receive(payload: BlingWebhookPayload, rawBody: Buffer | undefined, signature?: string) {
    const secret = process.env.BLING_CLIENT_SECRET;
    if (!secret || !rawBody) throw new ServiceUnavailableException('Webhook Bling não está configurado corretamente');
    if (!signature?.startsWith('sha256=')) throw new UnauthorizedException('Assinatura do Bling ausente ou inválida');

    const expected = createHmac('sha256', secret).update(rawBody).digest();
    const supplied = Buffer.from(signature.slice('sha256='.length), 'hex');
    if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) {
      throw new UnauthorizedException('Assinatura do Bling inválida');
    }

    if (payload.event !== 'order.created' && payload.event !== 'order.updated') return { received: true, ignored: true };
    if (payload.companyId === undefined || payload.companyId === null || payload.data?.id === undefined || payload.data.id === null) {
      return { received: true, ignored: true };
    }

    const companyId = String(payload.companyId);
    let connections = await this.prisma.blingConnection.count({ where: { companyId } });
    if (!connections) connections = await this.linkSoleConnection(companyId);
    if (!connections) return { received: true, ignored: true };

    const eventId = payload.eventId?.trim() || createHash('sha256').update(rawBody).digest('hex');
    const result = await this.prisma.blingWebhookEvent.createMany({
      data: [{
        eventId,
        companyId,
        event: payload.event,
        version: payload.version ?? 'v1',
        remoteId: String(payload.data.id),
        orderNumber: payload.data.numeroLoja?.trim() || null,
        payload: payload as unknown as Prisma.InputJsonValue,
      }],
      skipDuplicates: true,
    });

    return { received: true, ignored: false, queued: result.count === 1, duplicate: result.count === 0 };
  }

  /**
   * Conexão feita sem a permissão de leitura da empresa fica sem `companyId`. Como o webhook já veio assinado
   * com o segredo do nosso aplicativo, se existe exatamente uma conexão sem empresa, o ID vem do próprio evento.
   */
  private async linkSoleConnection(companyId: string) {
    const unlinked = await this.prisma.blingConnection.findMany({ where: { companyId: null }, select: { storeId: true }, take: 2 });
    if (unlinked.length !== 1) return 0;
    const done = await this.prisma.blingConnection.updateMany({ where: { storeId: unlinked[0].storeId, companyId: null }, data: { companyId, lastError: null } });
    return done.count;
  }

  @Interval(2_000)
  async tick() {
    if (process.env.BLING_WORKER === 'off') return;
    await this.processDue();
  }

  async processDue() {
    if (this.running) return 0;
    this.running = true;
    let processed = 0;
    try {
      const due = await this.prisma.blingWebhookEvent.findMany({
        where: {
          status: { in: [BlingWebhookStatus.PENDING, BlingWebhookStatus.PROCESSING] },
          attempts: { lt: 8 },
          nextAttemptAt: { lte: new Date() },
        },
        orderBy: { receivedAt: 'asc' },
        take: 5,
        select: { id: true },
      });
      for (const event of due) {
        const now = new Date();
        const claimed = await this.prisma.blingWebhookEvent.updateMany({
          where: {
            id: event.id,
            status: { in: [BlingWebhookStatus.PENDING, BlingWebhookStatus.PROCESSING] },
            attempts: { lt: 8 },
            nextAttemptAt: { lte: now },
          },
          data: { status: BlingWebhookStatus.PROCESSING, nextAttemptAt: new Date(now.getTime() + 2 * 60_000) },
        });
        if (!claimed.count) continue;
        const row = await this.prisma.blingWebhookEvent.findUniqueOrThrow({ where: { id: event.id } });
        try {
          await this.processOrder(JSON.parse(JSON.stringify(row.payload)) as BlingWebhookPayload);
          await this.prisma.blingWebhookEvent.update({
            where: { id: row.id },
            data: { status: BlingWebhookStatus.PROCESSED, processedAt: new Date(), lastError: null },
          });
          processed++;
        } catch (error) {
          const attempts = row.attempts + 1;
          const exhausted = attempts >= 8;
          const delay = Math.min(2 ** attempts * 60_000, 6 * 60 * 60_000);
          await this.prisma.blingWebhookEvent.update({
            where: { id: row.id },
            data: {
              status: exhausted ? BlingWebhookStatus.FAILED : BlingWebhookStatus.PENDING,
              attempts,
              lastError: (error as Error).message.slice(0, 300),
              nextAttemptAt: exhausted ? new Date() : new Date(Date.now() + delay),
            },
          });
          this.logger.warn('Webhook Bling ' + row.eventId + ' falhou na tentativa ' + attempts + ': ' + (error as Error).message.slice(0, 200));
        }
      }
    } catch (error) {
      this.logger.error('Falha ao processar caixa de entrada de webhooks do Bling', error as Error);
    } finally {
      this.running = false;
    }
    return processed;
  }

  private async processOrder(payload: BlingWebhookPayload) {
    if (payload.event !== 'order.created' && payload.event !== 'order.updated') return;
    const companyId = payload.companyId;
    if (companyId === undefined || companyId === null) return;

    const connections = await this.prisma.blingConnection.findMany({
      where: { companyId: String(companyId) },
      select: { storeId: true },
    });
    if (!connections.length) return;

    const storeIds = connections.map(connection => connection.storeId);
    const orderNumber = payload.data?.numeroLoja?.trim();
    const remoteId = payload.data?.id === undefined || payload.data.id === null ? null : String(payload.data.id);
    const remoteNumber = payload.data?.numero === undefined || payload.data.numero === null ? null : String(payload.data.numero);
    const situationId = payload.data?.situacao?.id === undefined || payload.data.situacao.id === null ? null : String(payload.data.situacao.id);
    const existingSync = remoteId
      ? await this.prisma.blingOrderSync.findFirst({ where: { storeId: { in: storeIds }, blingOrderId: remoteId }, select: { orderId: true } })
      : null;
    const order = existingSync
      ? await this.prisma.order.findUnique({ where: { id: existingSync.orderId }, select: { id: true, storeId: true } })
      : orderNumber
        ? await this.prisma.order.findFirst({ where: { storeId: { in: storeIds }, number: orderNumber }, select: { id: true, storeId: true } })
        : null;
    if (!order) return;

    const currentSync = await this.prisma.blingOrderSync.findUnique({
      where: { orderId: order.id },
      select: { blingSituationId: true, blingSituationName: true },
    });
    let situationName: string | null = currentSync?.blingSituationId === situationId ? currentSync.blingSituationName : null;
    if (situationId && !situationName) {
      const token = await this.auth.accessToken(order.storeId);
      const result = await this.client.request<{ data?: { nome?: string; descricao?: string } }>(token, '/situacoes/' + encodeURIComponent(situationId));
      situationName = result.data?.nome ?? result.data?.descricao ?? null;
    }

    await this.prisma.blingOrderSync.upsert({
      where: { orderId: order.id },
      create: {
        storeId: order.storeId,
        orderId: order.id,
        status: BlingSyncStatus.SENT,
        blingOrderId: remoteId,
        blingOrderNumber: remoteNumber,
        blingSituationId: situationId,
        blingSituationName: situationName,
        sentAt: new Date(),
        lastError: null,
      },
      update: {
        status: BlingSyncStatus.SENT,
        ...(remoteId && { blingOrderId: remoteId }),
        ...(remoteNumber && { blingOrderNumber: remoteNumber }),
        blingSituationId: situationId,
        blingSituationName: situationName,
        sentAt: new Date(),
        lastError: null,
      },
    });
  }
}
