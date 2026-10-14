import { Body, Controller, Headers, HttpCode, Logger, Post, Query, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PaymentsWebhookService } from './payments-webhook.service';
import { verifyMercadoPagoSignature } from './webhook-signature';

/** Recebe notificações do Mercado Pago. O status é sempre relido na API do gateway; o corpo só informa o id. */
@ApiExcludeController()
@SkipThrottle()
@Controller('payments/webhooks')
export class PaymentsWebhookController {
  private readonly logger = new Logger(PaymentsWebhookController.name);

  constructor(private readonly webhooks: PaymentsWebhookService) {}

  @Post('mercadopago')
  @HttpCode(200)
  async mercadoPago(@Query() query: Record<string, string>, @Body() body: { type?: string; action?: string; data?: { id?: string | number } }, @Headers('x-signature') signature?: string, @Headers('x-request-id') requestId?: string) {
    const type = body?.type ?? query.type ?? query.topic;
    const dataId = String(body?.data?.id ?? query['data.id'] ?? query.id ?? '');
    const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
    if (secret && !verifyMercadoPagoSignature({ signature, requestId, dataId: query['data.id'] ?? dataId, secret })) throw new UnauthorizedException('Assinatura inválida');
    if (type !== 'payment' || !dataId) return { received: true };
    const result = await this.webhooks.syncMercadoPagoPayment(dataId);
    this.logger.log(`Webhook Mercado Pago ${dataId}: ${result}`);
    return { received: true };
  }
}
