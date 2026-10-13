import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { blingConnectSchema, runSyncSchema, blingConfigSchema } from '@storeos/contracts';
import { z } from 'zod';
import { NotFoundError } from '../../../shared/domain/errors';
import { AuthStoreId, CurrentAuth, RequirePermissions } from '../../../shared/presentation/decorators/auth.decorators';
import { ZodBody } from '../../../shared/presentation/pipes/zod';
import type { AuthContext } from '../../../shared/presentation/request.types';
import { IntegrationsService } from '../application/integrations.service';

const logsQuery = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(30), onlyErrors: z.coerce.boolean().default(false) });

@ApiTags('Admin · Integrações')
@ApiBearerAuth()
@Controller('admin/integrations')
export class IntegrationsAdminController {
  constructor(private readonly service: IntegrationsService) {}

  @RequirePermissions('integrations.read')
  @Get()
  async list(@AuthStoreId() storeId: string) {
    return { items: await this.service.list(storeId), supported: this.service.supportedErps() };
  }

  @RequirePermissions('integrations.read')
  @Get('queue/stats')
  stats(@AuthStoreId() storeId: string) {
    return this.service.queueStats(storeId);
  }

  @RequirePermissions('integrations.write')
  @Post('queue/:jobId/retry')
  async retry(@AuthStoreId() storeId: string, @Param('jobId', ParseUUIDPipe) jobId: string) {
    await this.service.retryJob(storeId, jobId);
    return { ok: true };
  }

  @RequirePermissions('integrations.write')
  @Post(':provider/connect')
  connect(@AuthStoreId() storeId: string, @CurrentAuth() auth: AuthContext, @Param('provider') provider: string, @ZodBody(blingConnectSchema) body: z.infer<typeof blingConnectSchema>) {
    return this.service.connectErp(storeId, provider, body, auth.subjectId);
  }

  @RequirePermissions('integrations.write')
  @Put(':provider/config')
  config(@AuthStoreId() storeId: string, @Param('provider') provider: string, @ZodBody(blingConfigSchema.partial()) body: Record<string, unknown>) {
    return this.service.updateConfig(storeId, provider, body);
  }

  @RequirePermissions('integrations.read')
  @Post(':provider/health')
  health(@AuthStoreId() storeId: string, @Param('provider') provider: string) {
    return this.service.checkHealth(storeId, provider);
  }

  @RequirePermissions('integrations.write')
  @Post(':provider/sync')
  async runSync(@AuthStoreId() storeId: string, @Param('provider') provider: string, @ZodBody(runSyncSchema) body: z.infer<typeof runSyncSchema>) {
    const row = await this.service.get(storeId, provider);
    if (!row) throw new NotFoundError('Integração não encontrada');
    const payload: Record<string, unknown> = body.type === 'IMPORT_PRODUCTS' || body.type === 'IMPORT_CUSTOMERS' ? { page: 1 } : body.entityId ? { orderId: body.entityId } : {};
    const type = body.type === 'IMPORT_PRICES' ? 'IMPORT_PRODUCTS' : body.type;
    await this.service.enqueue(storeId, row.id, type, payload, { dedupeKey: `manual:${type}:${body.entityId ?? 'all'}` });
    return { queued: true };
  }

  @RequirePermissions('integrations.read')
  @Get(':provider/logs')
  logs(@AuthStoreId() storeId: string, @Param('provider') provider: string, @Query() raw: Record<string, string>) {
    const q = logsQuery.parse(raw);
    return this.service.logs(storeId, provider, q.page, q.pageSize, q.onlyErrors);
  }

  @RequirePermissions('integrations.read')
  @Get(':provider/jobs')
  jobs(@AuthStoreId() storeId: string, @Param('provider') provider: string, @Query('status') status?: string) {
    return this.service.jobs(storeId, provider, status);
  }

  @RequirePermissions('integrations.write')
  @Delete(':provider')
  async disconnect(@AuthStoreId() storeId: string, @CurrentAuth() auth: AuthContext, @Param('provider') provider: string) {
    await this.service.disconnect(storeId, provider, auth.subjectId);
    return { ok: true };
  }
}
