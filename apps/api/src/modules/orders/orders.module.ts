import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { MarketingModule } from '../marketing/marketing.module';
import { OrdersService } from './application/orders.service';
import { OrdersAdminController, StorefrontOrdersController } from './presentation/orders.controller';

@Module({
  imports: [InventoryModule, MarketingModule],
  controllers: [OrdersAdminController, StorefrontOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
