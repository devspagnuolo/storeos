import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Query, RawBodyRequest, Req, Res } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { BlingSyncStatus } from '@prisma/client';
import { Request, Response } from 'express';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { BlingAuthService } from './bling-auth.service';
import { BlingImportService } from './bling-import.service';
import { BlingInvoicesService } from './bling-invoices.service';
import { BlingOrdersService } from './bling-orders.service';
import { BlingWebhookPayload, BlingWebhookService } from './bling-webhook.service';
import { BlingClient } from './bling.client';

const webOrigin = () => (process.env.WEB_ORIGIN?.split(',')[0] ?? 'http://localhost:3000').replace(/\/$/, '');

@ApiTags('Bling')
@Controller('bling')
export class BlingController {
  constructor(private readonly prisma: PrismaService, private readonly auth: BlingAuthService, private readonly client: BlingClient, private readonly imports: BlingImportService, private readonly orders: BlingOrdersService, private readonly invoices: BlingInvoicesService, private readonly webhooks: BlingWebhookService) {}

  @Get('status') @RequirePermissions(Permissions.SETTINGS_WRITE)
  async status(@CurrentStore() storeId: string) {
    const [connection, latestImport, sync, invoices] = await Promise.all([this.prisma.blingConnection.findUnique({ where: { storeId } }), this.imports.latest(storeId), this.orders.list(storeId), this.invoices.list(storeId)]);
    const apiUrl = process.env.API_PUBLIC_URL?.replace(/\/$/, '');
    return {
      appConfigured: this.client.appConfigured,
      callbackUrl: apiUrl ? `${apiUrl}/api/v1/bling/callback` : null,
      webhookUrl: apiUrl ? `${apiUrl}/api/v1/bling/webhook` : null,
      companyLinked: Boolean(connection?.companyId),
      connected: Boolean(connection), connectedAt: connection?.connectedAt ?? null, lastError: connection?.lastError ?? null,
      import: latestImport, orders: sync.counts, automaticInvoiceEnabled: connection?.automaticInvoiceEnabled ?? false, invoices,
    };
  }

  @Get('connect') @RequirePermissions(Permissions.SETTINGS_WRITE)
  connect(@CurrentStore() storeId: string) {
    return { url: this.auth.connectUrl(storeId) };
  }

  /** Destino do redirecionamento do Bling após o lojista autorizar. Público: a identidade vem do `state` assinado. */
  @Get('callback') @ApiExcludeEndpoint()
  async callback(@Query('code') code: string | undefined, @Query('state') state: string | undefined, @Res() res: Response) {
    if (!code || !state) throw new BadRequestException('Retorno do Bling incompleto');
    try {
      await this.auth.finishConnect(code, state);
      res.redirect(`${webOrigin()}/admin/bling?conectado=1`);
    } catch {
      res.redirect(`${webOrigin()}/admin/bling?erro=1`);
    }
  }

  /** Webhook do Bling autenticado por HMAC SHA-256 sobre o corpo original da requisição. */
  @Post('webhook') @HttpCode(200) @ApiExcludeEndpoint()
  webhook(@Headers('x-bling-signature-256') signature: string | undefined, @Body() payload: BlingWebhookPayload, @Req() request: RawBodyRequest<Request>) {
    return this.webhooks.receive(payload, request.rawBody, signature);
  }

  @Delete('connection') @HttpCode(204) @RequirePermissions(Permissions.SETTINGS_WRITE)
  disconnect(@CurrentStore() storeId: string) { return this.auth.disconnect(storeId); }

  @Post('import') @HttpCode(202) @RequirePermissions(Permissions.CATALOG_WRITE, Permissions.SETTINGS_WRITE)
  startImport(@CurrentStore() storeId: string) { return this.imports.start(storeId); }

  @Get('orders') @RequirePermissions(Permissions.ORDERS_READ)
  listOrders(@CurrentStore() storeId: string, @Query('status') status?: string) {
    return this.orders.list(storeId, status && status in BlingSyncStatus ? (status as BlingSyncStatus) : undefined);
  }

  @Post('orders/:number/send') @HttpCode(200) @RequirePermissions(Permissions.ORDERS_WRITE)
  sendOrder(@CurrentStore() storeId: string, @Param('number') number: string) { return this.orders.resend(storeId, number); }

  @Post('orders/:number/invoice') @HttpCode(202) @RequirePermissions(Permissions.ORDERS_WRITE)
  requestInvoice(@CurrentStore() storeId: string, @Param('number') number: string) { return this.invoices.request(storeId, number); }

  @Get('orders/:number/invoice') @RequirePermissions(Permissions.ORDERS_READ)
  findInvoice(@CurrentStore() storeId: string, @Param('number') number: string) { return this.invoices.findForOrder(storeId, number); }

  @Post('invoice-settings/automatic') @HttpCode(200) @RequirePermissions(Permissions.SETTINGS_WRITE)
  setAutomaticInvoice(@CurrentStore() storeId: string, @Body('enabled') enabled: unknown) {
    if (typeof enabled !== 'boolean') throw new BadRequestException('Informe enabled como true ou false');
    return this.invoices.setAutomaticInvoiceForStore(storeId, enabled);
  }
}
