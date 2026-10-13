import { Module } from '@nestjs/common';
import { ShippingService } from './application/shipping.service';
import { ShippingAdminController } from './presentation/shipping-admin.controller';
import { FlatRateProvider, ZoneTableProvider } from './providers/flat-rate.provider';
import { MelhorEnvioProvider } from './providers/melhor-envio.provider';

@Module({
  controllers: [ShippingAdminController],
  providers: [FlatRateProvider, ZoneTableProvider, MelhorEnvioProvider, ShippingService],
  exports: [ShippingService],
})
export class ShippingModule {}
