import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { MarketingModule } from '../marketing/marketing.module';
import { ShippingModule } from '../shipping/shipping.module';
import { CartService } from './application/cart.service';
import { CartController } from './presentation/cart.controller';

@Module({
  imports: [InventoryModule, MarketingModule, ShippingModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
