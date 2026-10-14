import { Module } from '@nestjs/common';
import { CARRIER_QUOTES } from './carrier';
import { MelhorEnvioClient } from './melhor-envio.client';
import { SuperFreteClient } from './superfrete.client';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';
@Module({ controllers: [ShippingController], providers: [ShippingService, MelhorEnvioClient, SuperFreteClient, { provide: CARRIER_QUOTES, useFactory: (superFrete: SuperFreteClient, melhorEnvio: MelhorEnvioClient) => (melhorEnvio.enabled && !superFrete.enabled ? melhorEnvio : superFrete), inject: [SuperFreteClient, MelhorEnvioClient] }], exports: [ShippingService] }) export class ShippingModule {}
