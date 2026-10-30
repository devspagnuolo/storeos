import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { OrderTrackingService } from './order-tracking.service';

@ApiTags('Acompanhar pedido')
@Controller('order-tracking')
export class OrderTrackingController {
  constructor(private readonly tracking: OrderTrackingService) {}

  // A consulta chega pelo servidor do site, então todas as clientes dividem o mesmo IP: o limite é folgado e a proteção
  // é exigir número e e-mail juntos (a resposta não traz endereço nem valores).
  @Get() @Throttle({ default: { limit: 60, ttl: 60_000 } }) @ApiOperation({ summary: 'Acompanhamento público do pedido (número + e-mail do comprador)' })
  track(@Query('store') store: string, @Query('number') number: string, @Query('email') email: string) { return this.tracking.track(store, number, email); }
}
