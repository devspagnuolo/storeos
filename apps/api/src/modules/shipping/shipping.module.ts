import { Module } from '@nestjs/common';
import { CARRIER_QUOTES } from './carrier';
import { MelhorEnvioClient } from './melhor-envio.client';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';
@Module({ controllers: [ShippingController], providers: [ShippingService, MelhorEnvioClient, { provide: CARRIER_QUOTES, useExisting: MelhorEnvioClient }], exports: [ShippingService] }) export class ShippingModule {}
