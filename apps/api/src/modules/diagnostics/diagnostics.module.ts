import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { ShippingModule } from '../shipping/shipping.module';
import { DiagnosticsController } from './diagnostics.controller';
import { DiagnosticsService } from './diagnostics.service';

@Module({ imports: [PaymentsModule, ShippingModule], controllers: [DiagnosticsController], providers: [DiagnosticsService] })
export class DiagnosticsModule {}
