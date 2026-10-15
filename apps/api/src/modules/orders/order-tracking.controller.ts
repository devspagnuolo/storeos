import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { OrderTrackingService } from './order-tracking.service';

@ApiTags('Acompanhar pedido')
@Controller('order-tracking')
export class OrderTrackingController {
  constructor(private readonly tracking: OrderTrackingService) {}

  @Get() @Throttle({ default: { limit: 10, ttl: 60_000 } }) @ApiOperation({ summary: 'Acompanhamento público do pedido (número + e-mail do comprador)' })
  track(@Query('store') store: string, @Query('number') number: string, @Query('email') email: string) { return this.tracking.track(store, number, email); }
}
