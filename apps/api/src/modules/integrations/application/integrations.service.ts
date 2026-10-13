import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { blingConfigSchema, type IntegrationLogView, type IntegrationView, type SyncJobView } from '@storeos/contracts';
import { BusinessRuleError, NotFoundError } from '../../../shared/domain/errors';
import { paginate, skipTake } from '../../../shared/domain/pagination';
import { AuditService } from '../../../shared/infrastructure/audit/audit.service';
import { EncryptionService } from '../../../shared/infrastructure/crypto/encryption.service';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { RequestContext } from '../../../shared/infrastructure/request-context';
import { BlingProvider } from '../providers/bling.provider';
import { ErpCredentials, ErpProvider } from '../providers/erp-provider';

@Injectable()
export class IntegrationsService {
  private readonly erp: Map<string, ErpProvider>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: EncryptionService,
    private readonly audit: AuditService,
    bling: BlingProvider,
  ) {
    this.erp = new Map<string, ErpProvider>([[bling.key, bling]]);
  }

  erpProvider(key: string): ErpProvider {
    const provider = this.erp.get(key);
    if (!provider) throw new BusinessRuleError(`Provedor de ERP não suportado: ${key}`, 'ERP_NOT_SUPPORTED');
    return provider;
  }

  supportedErps(): string[] {
    return [...this.erp.keys()];
  }

  async list(storeId: string): Promise<IntegrationView[]> {
    const rows = await this.prisma.integration.findMany({ where: { storeId }, orderBy: { createdAt: 'asc' } });
    return rows.map((r) => this.toView(r));
  }

  async get(storeId: string, provider: string) {
    const row = await this.prisma.integration.findUnique({ where: { storeId_provider: { storeId, provider } } });
    if (!row) throw new NotFoundError('Integração não encontrada', 'INTEGRATION_NOT_FOUND');
    return row;
  }

  credentials(row: { credentialsEnc: string | null }): ErpCredentials {
    return row.credentialsEnc ? this.crypto.decryptJson<ErpCredentials>(row.credentialsEnc) : {};
  }

  /** Conecta (ou reconecta) um ERP. Credenciais nunca saem do servidor em texto claro. */
  async connectErp(storeId: string, provider: string, input: { clientId: string; clientSecret: string; authorizationCode?: string }, actorId?: string): Promise<IntegrationView> {
    const adapter = this.erpProvider(provider);
    let credentials: ErpCredentials = { clientId: input.clientId, clientSecret: input.clientSecret };
    credentials = await adapter.authenticate(credentials, input.authorizationCode);
    const health = await adapter.healthCheck(credentials);
    const existing = await this.prisma.integration.findUnique({ where: { storeId_provider: { storeId, provider } } });
    const config = existing?.config ?? blingConfigSchema.parse({});
    const row = await this.prisma.integration.upsert({
      where: { storeId_provider: { storeId, provider } },
      create: { storeId, kind: 'ERP', provider, status: health.ok ? 'CONNECTED' : 'ERROR', credentialsEnc: this.crypto.encryptJson(credentials), webhookSecretEnc: this.crypto.encrypt(input.clientSecret), config: config as Prisma.InputJsonValue, health: health.ok ? 'HEALTHY' : 'DOWN', healthCheckedAt: new Date(), lastError: health.ok ? null : health.detail },
      update: { status: health.ok ? 'CONNECTED' : 'ERROR', credentialsEnc: this.crypto.encryptJson(credentials), health: health.ok ? 'HEALTHY' : 'DOWN', healthCheckedAt: new Date(), lastError: health.ok ? null : health.detail },
    });
    await this.audit.record({ storeId, action: 'integrations.connected', entityType: 'Integration', entityId: row.id, metadata: { provider }, actorId });
    return this.toView(row);
  }

  async updateConfig(storeId: string, provider: string, config: Record<string, unknown>): Promise<IntegrationView> {
    const row = await this.get(storeId, provider);
    const merged = { ...((row.config ?? {}) as Record<string, unknown>), ...blingConfigSchema.partial().parse(config), ...(config.statusMap ? { statusMap: config.statusMap } : {}) };
    const updated = await this.prisma.integration.update({ where: { id: row.id }, data: { config: merged as Prisma.InputJsonValue } });
    return this.toView(updated);
  }

  async disconnect(storeId: string, provider: string, actorId?: string): Promise<void> {
    const row = await this.get(storeId, provider);
    await this.prisma.integration.update({ where: { id: row.id }, data: { status: 'DISCONNECTED', credentialsEnc: null, health: 'UNKNOWN' } });
    await this.audit.record({ storeId, action: 'integrations.disconnected', entityType: 'Integration', entityId: row.id, metadata: { provider }, actorId });
  }

  /** Garante access token válido (refresh automático) e persiste as novas credenciais. */
  async freshCredentials(integrationId: string): Promise<{ credentials: ErpCredentials; provider: ErpProvider; config: Record<string, unknown>; storeId: string }> {
    const row = await this.prisma.integration.findUniqueOrThrow({ where: { id: integrationId } });
    if (row.status === 'DISCONNECTED' || !row.credentialsEnc) throw new BusinessRuleError('Integração desconectada', 'INTEGRATION_DISCONNECTED');
    const provider = this.erpProvider(row.provider);
    let credentials = this.credentials(row);
    const expiresAt = Number(credentials.expiresAt ?? 0);
    if (!credentials.accessToken || expiresAt - Date.now() < 5 * 60_000) {
      credentials = await provider.authenticate(credentials);
      await this.prisma.integration.update({ where: { id: row.id }, data: { credentialsEnc: this.crypto.encryptJson(credentials), status: 'CONNECTED' } });
    }
    return { credentials, provider, config: (row.config ?? {}) as Record<string, unknown>, storeId: row.storeId };
  }

  async checkHealth(storeId: string, provider: string): Promise<IntegrationView> {
    const row = await this.get(storeId, provider);
    const { credentials, provider: adapter } = await this.freshCredentials(row.id);
    const health = await adapter.healthCheck(credentials);
    const updated = await this.prisma.integration.update({
      where: { id: row.id },
      data: { health: health.ok ? 'HEALTHY' : 'DOWN', healthCheckedAt: new Date(), status: health.ok ? 'CONNECTED' : 'ERROR', lastError: health.ok ? null : health.detail },
    });
    return this.toView(updated);
  }

  /** Registra uma chamada ao ERP com duração, sucesso e erro (sem credenciais). */
  async logged<T>(integrationId: string, storeId: string, operation: string, direction: 'INBOUND' | 'OUTBOUND', fn: () => Promise<T>, request?: unknown): Promise<T> {
    const started = Date.now();
    const correlationId = RequestContext.get()?.requestId;
    try {
      const result = await fn();
      await this.prisma.integrationLog.create({ data: { storeId, integrationId, direction, operation, success: true, durationMs: Date.now() - started, request: request as Prisma.InputJsonValue | undefined, correlationId } });
      return result;
    } catch (err) {
      await this.prisma.integrationLog.create({ data: { storeId, integrationId, direction, operation, success: false, durationMs: Date.now() - started, request: request as Prisma.InputJsonValue | undefined, error: (err as Error).message.slice(0, 1000), correlationId } });
      await this.prisma.integration.update({ where: { id: integrationId }, data: { lastError: (err as Error).message.slice(0, 500) } }).catch(() => undefined);
      throw err;
    }
  }

  async logs(storeId: string, provider: string, page: number, pageSize: number, onlyErrors: boolean) {
    const row = await this.get(storeId, provider);
    const where = { storeId, integrationId: row.id, ...(onlyErrors ? { success: false } : {}) };
    const [total, rows] = await Promise.all([
      this.prisma.integrationLog.count({ where }),
      this.prisma.integrationLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(page, pageSize) }),
    ]);
    const items: IntegrationLogView[] = rows.map((l) => ({ id: l.id, direction: l.direction, operation: l.operation, success: l.success, statusCode: l.statusCode, durationMs: l.durationMs, error: l.error, createdAt: l.createdAt.toISOString() }));
    return paginate(items, total, page, pageSize);
  }

  // ── fila ──

  async enqueue(storeId: string, integrationId: string, type: string, payload: Record<string, unknown> = {}, opts: { dedupeKey?: string; delaySeconds?: number } = {}): Promise<void> {
    const dedupeKey = opts.dedupeKey ?? null;
    if (dedupeKey) {
      const open = await this.prisma.syncJob.findFirst({ where: { integrationId, dedupeKey, status: { in: ['PENDING', 'RUNNING'] } } });
      if (open) return;
      // Chave reutilizável após conclusão: remove histórico idêntico antigo.
      await this.prisma.syncJob.deleteMany({ where: { integrationId, dedupeKey, status: { in: ['SUCCEEDED', 'DEAD', 'FAILED'] } } });
    }
    await this.prisma.syncJob.create({ data: { storeId, integrationId, type, payload: payload as Prisma.InputJsonValue, dedupeKey, nextRunAt: new Date(Date.now() + (opts.delaySeconds ?? 0) * 1000) } });
  }

  async jobs(storeId: string, provider: string, status?: string, take = 50): Promise<SyncJobView[]> {
    const row = await this.get(storeId, provider);
    const rows = await this.prisma.syncJob.findMany({ where: { storeId, integrationId: row.id, ...(status ? { status: status as never } : {}) }, orderBy: { createdAt: 'desc' }, take });
    return rows.map((j) => ({ id: j.id, type: j.type, status: j.status, attempts: j.attempts, maxAttempts: j.maxAttempts, nextRunAt: j.nextRunAt.toISOString(), lastError: j.lastError, createdAt: j.createdAt.toISOString(), finishedAt: j.finishedAt?.toISOString() ?? null }));
  }

  async retryJob(storeId: string, jobId: string): Promise<void> {
    const job = await this.prisma.syncJob.findFirst({ where: { id: jobId, storeId } });
    if (!job) throw new NotFoundError('Job não encontrado');
    if (!['DEAD', 'FAILED'].includes(job.status)) throw new BusinessRuleError('Somente jobs com falha podem ser reprocessados', 'JOB_NOT_RETRYABLE');
    await this.prisma.syncJob.update({ where: { id: jobId }, data: { status: 'PENDING', attempts: 0, nextRunAt: new Date(), lastError: null, finishedAt: null } });
  }

  async queueStats(storeId: string) {
    const rows = await this.prisma.syncJob.groupBy({ by: ['status'], where: { storeId }, _count: { _all: true } });
    return Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
  }

  private toView(r: { id: string; provider: string; kind: string; status: string; health: string; healthCheckedAt: Date | null; lastSyncAt: Date | null; lastError: string | null; config: Prisma.JsonValue }): IntegrationView {
    return { id: r.id, provider: r.provider, kind: r.kind, status: r.status, health: r.health, healthCheckedAt: r.healthCheckedAt?.toISOString() ?? null, lastSyncAt: r.lastSyncAt?.toISOString() ?? null, lastError: r.lastError, config: (r.config ?? {}) as Record<string, unknown> };
  }
}
