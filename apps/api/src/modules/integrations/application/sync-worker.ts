import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventNames } from '@storeos/contracts';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../../../config/app-config';
import { EventDispatcher } from '../../../shared/infrastructure/outbox/event-dispatcher';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { ErpSyncService } from './erp-sync.service';
import { IntegrationsService } from './integrations.service';

interface ClaimedJob {
  id: string;
  integrationId: string;
  storeId: string;
  type: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}

/** Fila de sincronização: claim com SKIP LOCKED, backoff exponencial, estado DEAD e agendamento periódico. */
@Injectable()
export class SyncWorker implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SyncWorker.name);
  private readonly workerId = `worker-${randomUUID().slice(0, 8)}`;
  private poll: NodeJS.Timeout | null = null;
  private schedule: NodeJS.Timeout | null = null;
  private busy = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: ErpSyncService,
    private readonly integrations: IntegrationsService,
    private readonly dispatcher: EventDispatcher,
    private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    // Pedido pago → exporta ao ERP (se exportOrders ativo).
    this.dispatcher.on(EventNames.ORDER_PAID, 'erp.export-order', async (e) => {
      const orderId = String(e.payload.orderId);
      const active = await this.prisma.integration.findMany({ where: { storeId: e.storeId, kind: 'ERP', status: 'CONNECTED' } });
      for (const integration of active) {
        const cfg = (integration.config ?? {}) as Record<string, unknown>;
        if (cfg.exportOrders === false) continue;
        await this.integrations.enqueue(e.storeId, integration.id, 'EXPORT_ORDER', { orderId }, { dedupeKey: `export:${orderId}` });
      }
    });
  }

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    this.poll = setInterval(() => void this.tick(), 5_000);
    this.schedule = setInterval(() => void this.scheduleRecurring(), 60_000);
    this.poll.unref();
    this.schedule.unref();
  }

  onModuleDestroy(): void {
    if (this.poll) clearInterval(this.poll);
    if (this.schedule) clearInterval(this.schedule);
  }

  /** Enfileira sincronizações periódicas conforme syncIntervalMinutes de cada integração. */
  async scheduleRecurring(): Promise<void> {
    try {
      const rows = await this.prisma.integration.findMany({ where: { kind: 'ERP', status: 'CONNECTED' } });
      for (const i of rows) {
        const cfg = (i.config ?? {}) as Record<string, unknown>;
        const minutes = Number(cfg.syncIntervalMinutes ?? 30);
        const due = !i.lastSyncAt || Date.now() - i.lastSyncAt.getTime() >= minutes * 60_000;
        if (!due) continue;
        if (cfg.importStock !== false) await this.integrations.enqueue(i.storeId, i.id, 'IMPORT_STOCK', {}, { dedupeKey: 'import-stock' });
        if (cfg.importProducts !== false && cfg.importPrices !== false) await this.integrations.enqueue(i.storeId, i.id, 'IMPORT_PRODUCTS', { page: 1 }, { dedupeKey: 'import-products:1' });
        // Evita reenfileirar a cada minuto mesmo se o job falhar.
        await this.prisma.integration.update({ where: { id: i.id }, data: { lastSyncAt: new Date() } });
      }
    } catch (err) {
      this.logger.error(`Agendamento ERP falhou: ${(err as Error).message}`);
    }
  }

  async tick(): Promise<number> {
    if (this.busy) return 0;
    this.busy = true;
    let processed = 0;
    try {
      for (let i = 0; i < 10; i += 1) {
        const job = await this.claim();
        if (!job) break;
        await this.execute(job);
        processed += 1;
      }
    } catch (err) {
      this.logger.error(`Worker ERP falhou: ${(err as Error).message}`);
    } finally {
      this.busy = false;
    }
    return processed;
  }

  private async claim(): Promise<ClaimedJob | null> {
    const rows = await this.prisma.$queryRaw<ClaimedJob[]>(Prisma.sql`
      UPDATE "SyncJob" SET status = 'RUNNING', "lockedAt" = now(), "lockedBy" = ${this.workerId}, attempts = attempts + 1
      WHERE id = (
        SELECT id FROM "SyncJob"
        WHERE (status = 'PENDING' AND "nextRunAt" <= now())
           OR (status = 'RUNNING' AND "lockedAt" < now() - interval '10 minutes')
        ORDER BY "nextRunAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id, "integrationId", "storeId", type, payload, attempts, "maxAttempts"`);
    return rows[0] ?? null;
  }

  private async execute(job: ClaimedJob): Promise<void> {
    try {
      const result = await this.sync.run(job);
      await this.prisma.syncJob.update({ where: { id: job.id }, data: { status: 'SUCCEEDED', result: result as Prisma.InputJsonValue, finishedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null } });
    } catch (err) {
      const message = (err as Error).message.slice(0, 1000);
      const dead = job.attempts >= job.maxAttempts;
      const backoffSeconds = Math.min(3600, 30 * 2 ** (job.attempts - 1));
      await this.prisma.syncJob.update({
        where: { id: job.id },
        data: dead
          ? { status: 'DEAD', lastError: message, finishedAt: new Date(), lockedAt: null, lockedBy: null }
          : { status: 'PENDING', lastError: message, nextRunAt: new Date(Date.now() + backoffSeconds * 1000), lockedAt: null, lockedBy: null },
      });
      if (dead) this.logger.warn(`Job ${job.id} (${job.type}) esgotou tentativas: ${message}`);
    }
  }
}
