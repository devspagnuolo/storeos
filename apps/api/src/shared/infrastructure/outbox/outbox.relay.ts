import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { DomainEventEnvelope } from '@storeos/contracts';
import { AppConfig } from '../../../config/app-config';
import { RabbitMqService } from '../messaging/rabbitmq.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventDispatcher } from './event-dispatcher';

interface ClaimedRow {
  id: string;
  storeId: string;
  aggregateType: string;
  aggregateId: string;
  eventName: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
  attempts: number;
}

const MAX_ATTEMPTS = 25;
const BATCH_SIZE = 25;

/**
 * Relay do Transactional Outbox: reivindica eventos pendentes com lease (SKIP LOCKED),
 * entrega aos consumidores internos e publica no RabbitMQ. Falhas reagendam com backoff exponencial.
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: EventDispatcher,
    private readonly rabbit: RabbitMqService,
    private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.env.OUTBOX_RELAY_ENABLED || this.config.isTest) return;
    this.timer = setInterval(() => void this.drain(), 1_500);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Processa um lote; retorna a quantidade de eventos tentados. Exposto para testes. */
  async drain(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const rows = await this.claim();
      for (const row of rows) await this.process(row);
      return rows.length;
    } catch (err) {
      this.logger.error(`Falha no relay do outbox: ${(err as Error).message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  private claim(): Promise<ClaimedRow[]> {
    return this.prisma.$queryRaw<ClaimedRow[]>`
      UPDATE "OutboxEvent"
         SET "nextAttemptAt" = now() + interval '60 seconds', "attempts" = "attempts" + 1
       WHERE id IN (
         SELECT id FROM "OutboxEvent"
          WHERE "publishedAt" IS NULL AND "nextAttemptAt" <= now() AND "attempts" < ${MAX_ATTEMPTS}
          ORDER BY "occurredAt" ASC
          LIMIT ${BATCH_SIZE}
          FOR UPDATE SKIP LOCKED
       )
      RETURNING id, "storeId", "aggregateType", "aggregateId", "eventName", payload, "occurredAt", attempts`;
  }

  private async process(row: ClaimedRow): Promise<void> {
    const envelope: DomainEventEnvelope = {
      id: row.id,
      name: row.eventName,
      storeId: row.storeId,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      occurredAt: row.occurredAt.toISOString(),
      version: 1,
      payload: row.payload,
    };
    try {
      await this.dispatcher.dispatch(envelope);
      await this.rabbit.publish(row.eventName, envelope, row.id);
      await this.prisma.outboxEvent.update({ where: { id: row.id }, data: { publishedAt: new Date(), lastError: null } });
    } catch (err) {
      const backoffSeconds = Math.min(3600, 2 ** Math.min(row.attempts, 11));
      this.logger.warn(`Evento ${row.eventName} (${row.id}) falhou na tentativa ${row.attempts}: ${(err as Error).message}`);
      await this.prisma.$executeRaw`
        UPDATE "OutboxEvent"
           SET "nextAttemptAt" = now() + make_interval(secs => ${backoffSeconds}::double precision), "lastError" = ${(err as Error).message.slice(0, 500)}
         WHERE id = ${row.id}`;
    }
  }
}
