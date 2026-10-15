import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { ShippingModule } from '../shipping/shipping.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { CheckoutDraftCleanupJob } from './checkout-draft.job';
import { CheckoutDraftService } from './checkout-draft.service';
@Module({ imports: [OrdersModule, PaymentsModule, ShippingModule, PromotionsModule], controllers: [CheckoutController], providers: [CheckoutService, CheckoutDraftService, CheckoutDraftCleanupJob] }) export class CheckoutModule {}
