import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { InventoryModule } from '../inventory/inventory.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { MarketingModule } from '../marketing/marketing.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { ShippingModule } from '../shipping/shipping.module';
import { CheckoutService } from './application/checkout.service';
import { CheckoutController } from './presentation/checkout.controller';

@Module({
  imports: [CartModule, ShippingModule, MarketingModule, InventoryModule, OrdersModule, LoyaltyModule, PaymentsModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
