import { Module } from '@nestjs/common';
import { OrderLifecycleService } from './order-lifecycle.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PaymentExpiryJob } from './payment-expiry.job';
@Module({ controllers: [OrdersController], providers: [OrdersService, OrderLifecycleService, PaymentExpiryJob], exports: [OrdersService, OrderLifecycleService] }) export class OrdersModule {}
