import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
@Module({ imports: [PaymentsModule], controllers: [CheckoutController], providers: [CheckoutService] }) export class CheckoutModule {}
