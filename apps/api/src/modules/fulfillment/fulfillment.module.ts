import { Module } from '@nestjs/common';
import { BlingModule } from '../bling/bling.module';
import { OrdersModule } from '../orders/orders.module';
import { ShippingModule } from '../shipping/shipping.module';
import { FulfillmentAutomationService } from './fulfillment-automation.service';
import { FulfillmentController } from './fulfillment.controller';
@Module({ imports: [OrdersModule, BlingModule, ShippingModule], controllers: [FulfillmentController], providers: [FulfillmentAutomationService] }) export class FulfillmentModule {}
