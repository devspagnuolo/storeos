import { Controller, ForbiddenException, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController, ApiTags } from '@nestjs/swagger';
import { refundOrderSchema } from '@storeos/contracts';
import { z } from 'zod';
import { SkipThrottle } from '@nestjs/throttler';
import { AppConfig } from '../../../config/app-config';
import { NotFoundError } from '../../../shared/domain/errors';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { CurrentAuth, Public, RequirePermissions } from '../../../shared/presentation/decorators/auth.decorators';
import { ZodBody } from '../../../shared/presentation/pipes/zod';
import type { AppRequest, AuthContext } from '../../../shared/presentation/request.types';
import { PaymentGatewayService } from '../application/payment-gateway.service';
import { PaymentsService } from '../application/payments.service';

@ApiTags('Webhooks')
@Public()
@SkipThrottle()
@Controller('webhooks/payments')
export class PaymentWebhooksController {
  constructor(private readonly payments: PaymentsService) {}

  @HttpCode(200)
  @Post(':provider')
  async receive(@Param('provider') provider: string, @Query() query: Record<string, string>, @Req() req: AppRequest) {
    const storeId = query.store;
    if (!storeId || !/^[0-9a-f-]{36}$/.test(storeId)) throw new NotFoundError('Loja inválida');
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    return this.payments.handleWebhook({ providerKey: provider, storeId, headers: req.headers, rawBody, query });
  }
}

/** Utilitário de desenvolvimento: aprova pagamentos do provedor "mock". Desabilitado em produção. */
@ApiExcludeController()
@Public()
@Controller('store/dev/payments')
export class DevPaymentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PaymentGatewayService,
    private readonly payments: PaymentsService,
    private readonly config: AppConfig,
  ) {}

  @HttpCode(200)
  @Post(':paymentId/approve')
  async approve(@Param('paymentId') paymentId: string) {
    if (this.config.isProduction) throw new ForbiddenException();
    const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, provider: 'mock' } });
    if (!payment?.providerPaymentId) throw new NotFoundError('Pagamento não encontrado');
    const result = this.gateway.mock.approve(payment.providerPaymentId);
    if (!result) throw new NotFoundError('Pagamento mock não encontrado (reinício do servidor?)');
    await this.payments.applyResult(payment.storeId, payment.id, result);
    return { status: 'PAID' };
  }
}

@ApiTags('Admin · Pedidos (OMS)')
@ApiBearerAuth()
@Controller('admin/orders')
export class PaymentsAdminController {
  constructor(private readonly payments: PaymentsService) {}

  @RequirePermissions('orders.refund')
  @HttpCode(200)
  @Post(':id/refund')
  refund(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @ZodBody(refundOrderSchema) body: z.infer<typeof refundOrderSchema>) {
    return this.payments.refundOrder(auth.storeId, id, body, auth.subjectId);
  }
}
