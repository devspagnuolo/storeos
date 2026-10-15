import { Module } from '@nestjs/common';
import { ManualOrdersService } from './manual-orders.service';
import { OrderLifecycleService } from './order-lifecycle.service';
import { OrderTrackingController } from './order-tracking.controller';
import { OrderTrackingService } from './order-tracking.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PaymentExpiryJob } from './payment-expiry.job';
@Module({ controllers: [OrdersController, OrderTrackingController], providers: [OrdersService, ManualOrdersService, OrderLifecycleService, OrderTrackingService, PaymentExpiryJob], exports: [OrdersService, OrderLifecycleService] }) export class OrdersModule {}
