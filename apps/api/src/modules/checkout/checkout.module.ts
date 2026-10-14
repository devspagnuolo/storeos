import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { ShippingModule } from '../shipping/shipping.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
@Module({ imports: [OrdersModule, PaymentsModule, ShippingModule], controllers: [CheckoutController], providers: [CheckoutService] }) export class CheckoutModule {}
