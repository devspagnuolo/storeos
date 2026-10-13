import { Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { NotFoundError } from '../../../shared/domain/errors';
import { EncryptionService } from '../../../shared/infrastructure/crypto/encryption.service';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { Public } from '../../../shared/presentation/decorators/auth.decorators';
import type { AppRequest } from '../../../shared/presentation/request.types';
import { ErpSyncService } from '../application/erp-sync.service';
import { IntegrationsService } from '../application/integrations.service';
import type { ErpCredentials } from '../providers/erp-provider';

/** Webhooks de ERP: valida HMAC, deduplica por eventId e delega a reconsulta ao worker. */
@ApiTags('Webhooks')
@Public()
@SkipThrottle()
@Controller('webhooks/erp')
export class ErpWebhookController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: EncryptionService,
    private readonly integrations: IntegrationsService,
    private readonly sync: ErpSyncService,
  ) {}

  /** URL configurada no ERP: /webhooks/erp/:provider/:integrationId */
  @HttpCode(200)
  @Post(':provider/:integrationId')
  async receive(@Param('provider') providerKey: string, @Param('integrationId') integrationId: string, @Req() req: AppRequest) {
    if (!/^[0-9a-f-]{36}$/.test(integrationId)) throw new NotFoundError('Integração inválida');
    const integration = await this.prisma.integration.findFirst({ where: { id: integrationId, provider: providerKey, kind: 'ERP' } });
    if (!integration?.credentialsEnc) throw new NotFoundError('Integração não encontrada');
    const provider = this.integrations.erpProvider(providerKey);
    const credentials = this.crypto.decryptJson<ErpCredentials>(integration.credentialsEnc);
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const event = provider.parseWebhook(req.headers, rawBody, credentials);

    if (!event.valid) {
      await this.prisma.webhookEvent
        .create({ data: { storeId: integration.storeId, provider: `erp:${providerKey}`, eventId: `${event.eventId}:${Date.now()}`, payload: {}, signatureValid: false, status: 'FAILED', error: 'Assinatura inválida' } })
        .catch(() => undefined);
      return { received: false };
    }

    const existing = await this.prisma.webhookEvent.findUnique({ where: { provider_eventId: { provider: `erp:${providerKey}`, eventId: event.eventId } } });
    if (existing) return { received: true, duplicate: true };

    let payload: object = {};
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as object;
    } catch {
      /* corpo não-JSON já foi barrado pelo parser do provider */
    }
    await this.prisma.webhookEvent.create({ data: { storeId: integration.storeId, provider: `erp:${providerKey}`, eventId: event.eventId, eventType: event.resource, payload, signatureValid: true } });
    try {
      await this.sync.handleErpEvent(integration.id, event.resource, event.externalId);
      await this.prisma.webhookEvent.update({ where: { provider_eventId: { provider: `erp:${providerKey}`, eventId: event.eventId } }, data: { status: 'PROCESSED', processedAt: new Date() } });
    } catch (err) {
      await this.prisma.webhookEvent.update({ where: { provider_eventId: { provider: `erp:${providerKey}`, eventId: event.eventId } }, data: { status: 'FAILED', error: (err as Error).message.slice(0, 500) } });
    }
    return { received: true };
  }
}
