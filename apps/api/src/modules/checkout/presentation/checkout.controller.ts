import { Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { checkoutSchema } from '@storeos/contracts';
import { z } from 'zod';
import { ClientIp, CurrentAuthOptional, Public, PublicStore, UserAgent } from '../../../shared/presentation/decorators/auth.decorators';
import { ZodBody } from '../../../shared/presentation/pipes/zod';
import type { AuthContext, StoreContext } from '../../../shared/presentation/request.types';
import { CheckoutService } from '../application/checkout.service';

@ApiTags('Storefront · Checkout')
@ApiHeader({ name: 'x-store-slug', required: false })
@ApiHeader({ name: 'idempotency-key', required: false, description: 'Chave única por tentativa de compra; repetições devolvem o mesmo resultado' })
@Public()
@Controller('store/checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(201)
  @Post()
  place(
    @PublicStore() store: StoreContext,
    @ZodBody(checkoutSchema) body: z.infer<typeof checkoutSchema>,
    @Headers('idempotency-key') idempotencyKey?: string,
    @CurrentAuthOptional() auth?: AuthContext,
    @ClientIp() ip?: string,
    @UserAgent() userAgent?: string,
  ) {
    return this.checkout.place(store.id, body, {
      ip,
      userAgent,
      customerId: auth?.type === 'customer' ? auth.subjectId : null,
      idempotencyKey: idempotencyKey?.slice(0, 80),
    });
  }
}
