import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { FidelizeiRedemption, FidelizeiRedemptionStatus, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { FidelizeiApiError, FidelizeiClient } from './fidelizei.client';
import { idempotencyKey, nextAttempt } from './fidelizei-rules';
import { FidelizeiService } from './fidelizei.service';

type EventsResponse = { data: { id: number; eventType: string; entityId: string }[]; nextCursor: number; hasMore: boolean };
const CANCELLED_ORDER: OrderStatus[] = [OrderStatus.CANCELLED, OrderStatus.REFUNDED];

/**
 * Acompanha os benefícios usados nos pedidos:
 * pedido no Bling → confirma o uso no Fidelizei; pedido cancelado → devolve os pontos; e lê a fila de eventos para conciliar.
 */
@Injectable()
export class FidelizeiSyncService {
  private readonly logger = new Logger(FidelizeiSyncService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly client: FidelizeiClient, private readonly fidelizei: FidelizeiService) {}

  @Interval(60_000)
  async tick() {
    if (this.running || process.env.FIDELIZEI_WORKER === 'off') return;
    this.running = true;
    try {
      await this.processDue();
      await this.readEvents();
    } catch (error) {
      this.logger.error(`Sincronização com o Fidelizei falhou: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Devolve quantos benefícios mudaram de situação. */
  async processDue(now = new Date()) {
    let changed = 0;
    // Reservas que ninguém usou: o próprio Fidelizei devolve os pontos ao vencer.
    changed += (await this.prisma.fidelizeiRedemption.updateMany({ where: { status: FidelizeiRedemptionStatus.RESERVED, orderId: null, reservationExpiresAt: { lt: new Date(now.getTime() - 60_000) } }, data: { status: FidelizeiRedemptionStatus.EXPIRED } })).count;

    const due = await this.prisma.fidelizeiRedemption.findMany({
      where: { orderId: { not: null }, nextAttemptAt: { lte: now }, OR: [{ status: FidelizeiRedemptionStatus.RESERVED }, { status: FidelizeiRedemptionStatus.CONFIRMED, order: { status: { in: CANCELLED_ORDER } } }] },
      include: { order: { select: { number: true, status: true, blingSync: { select: { blingOrderId: true, blingOrderNumber: true } } } } },
      orderBy: { nextAttemptAt: 'asc' },
      take: 50,
    });
    for (const row of due) {
      try {
        if (await this.advance(row)) changed++;
      } catch (error) {
        await this.retryLater(row, error);
      }
    }
    return changed;
  }

  private async advance(row: FidelizeiRedemption & { order: { number: string; status: OrderStatus; blingSync: { blingOrderId: string | null; blingOrderNumber: string | null } | null } | null }) {
    const order = row.order!;
    const bling = order.blingSync?.blingOrderId && order.blingSync.blingOrderNumber ? order.blingSync : null;
    if (row.status === FidelizeiRedemptionStatus.RESERVED && CANCELLED_ORDER.includes(order.status)) {
      // Pedido não foi pago (ou foi cancelado antes do Bling): os pontos voltam para a cliente.
      await this.fidelizei.cancelRemote(row, { checkoutId: row.checkoutId, reason: 'checkout_failed' });
      await this.done(row, FidelizeiRedemptionStatus.CANCELLED);
      return true;
    }
    if (row.status === FidelizeiRedemptionStatus.RESERVED && bling) {
      const { apiKey } = await this.fidelizei.connectionOrFail(row.storeId, true);
      const body = { checkoutId: row.checkoutId, blingOrderId: bling.blingOrderId!, blingOrderNumber: bling.blingOrderNumber! };
      await this.client.request(apiKey, `/storeos/redemptions/${encodeURIComponent(row.redemptionId)}/confirm`, { method: 'POST', body, idempotencyKey: idempotencyKey(`confirm-${row.redemptionId}`, body) });
      await this.done(row, FidelizeiRedemptionStatus.CONFIRMED);
      return true;
    }
    if (row.status === FidelizeiRedemptionStatus.CONFIRMED && CANCELLED_ORDER.includes(order.status) && bling) {
      // Cupom já usado: o Fidelizei só estorna depois que o cancelamento chega pelo Bling; até lá, tenta de novo.
      await this.fidelizei.cancelRemote(row, { blingOrderId: bling.blingOrderId!, reason: 'order_cancelled' });
      await this.done(row, FidelizeiRedemptionStatus.CANCELLED);
      return true;
    }
    // Pedido ainda sem número no Bling: espera.
    await this.prisma.fidelizeiRedemption.update({ where: { id: row.id }, data: { nextAttemptAt: nextAttempt(Math.min(row.attempts, 2)) } });
    return false;
  }

  private done(row: FidelizeiRedemption, status: FidelizeiRedemptionStatus) {
    const now = new Date();
    return this.prisma.fidelizeiRedemption.update({ where: { id: row.id }, data: { status, attempts: 0, lastError: null, nextAttemptAt: now, ...(status === FidelizeiRedemptionStatus.CONFIRMED ? { confirmedAt: now } : { cancelledAt: now }) } });
  }

  private async retryLater(row: FidelizeiRedemption, error: unknown) {
    const message = (error as Error).message.slice(0, 300);
    const code = error instanceof FidelizeiApiError ? error.code : undefined;
    // A reserva venceu antes de o pedido chegar ao Bling: o desconto já foi dado e os pontos voltaram para a cliente.
    if (row.status === FidelizeiRedemptionStatus.RESERVED && (code === 'INVALID_REDEMPTION_STATUS' || code === 'REDEMPTION_NOT_FOUND')) {
      await this.prisma.fidelizeiRedemption.update({ where: { id: row.id }, data: { status: FidelizeiRedemptionStatus.FAILED, lastError: `Não confirmado no Fidelizei: ${message}` } });
      this.logger.warn(`Benefício ${row.code} não confirmado: ${message}`);
      return;
    }
    await this.prisma.fidelizeiRedemption.update({ where: { id: row.id }, data: { attempts: { increment: 1 }, lastError: message, nextAttemptAt: nextAttempt(row.attempts) } });
  }

  /** Fila de eventos do Fidelizei: confirma o que mudou lá (reserva vencida, cancelada ou usada). */
  async readEvents() {
    const connections = await this.prisma.fidelizeiConnection.findMany({ where: { enabled: true } });
    for (const connection of connections) {
      try {
        const { apiKey } = await this.fidelizei.connectionOrFail(connection.storeId);
        let cursor = connection.eventsCursor;
        for (let page = 0; page < 5; page++) {
          const result = await this.client.request<EventsResponse>(apiKey, `/storeos/events?after=${cursor}&limit=100`);
          for (const event of result.data) await this.apply(connection.storeId, event);
          if (!result.data.length) break;
          cursor = result.nextCursor;
          await this.prisma.fidelizeiConnection.update({ where: { storeId: connection.storeId }, data: { eventsCursor: cursor } });
          if (!result.hasMore) break;
        }
      } catch (error) {
        this.logger.warn(`Eventos do Fidelizei não lidos: ${(error as Error).message.slice(0, 200)}`);
      }
    }
  }

  private async apply(storeId: string, event: { eventType: string; entityId: string }) {
    const row = await this.prisma.fidelizeiRedemption.findFirst({ where: { storeId, redemptionId: event.entityId } });
    if (!row) return;
    if (event.eventType === 'redemption.used' && row.status === FidelizeiRedemptionStatus.RESERVED) await this.done(row, FidelizeiRedemptionStatus.CONFIRMED);
    if (['redemption.expired', 'redemption.cancelled'].includes(event.eventType) && row.status === FidelizeiRedemptionStatus.RESERVED) {
      // Com pedido já criado, a reserva vencida é uma falha a olhar no painel; sem pedido, só expirou.
      const status = row.orderId ? FidelizeiRedemptionStatus.FAILED : event.eventType === 'redemption.expired' ? FidelizeiRedemptionStatus.EXPIRED : FidelizeiRedemptionStatus.CANCELLED;
      await this.prisma.fidelizeiRedemption.update({ where: { id: row.id }, data: { status, ...(row.orderId && { lastError: 'A reserva venceu no Fidelizei antes de o pedido chegar ao Bling; os pontos voltaram para a cliente.' }) } });
    }
    if (event.eventType === 'redemption.cancelled' && row.status === FidelizeiRedemptionStatus.CONFIRMED) await this.done(row, FidelizeiRedemptionStatus.CANCELLED);
  }
}
