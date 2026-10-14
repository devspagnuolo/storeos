import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { OrdersModule } from './modules/orders/orders.module';
import { CustomersModule } from './modules/customers/customers.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { StoreModule } from './modules/store/store.module';
import { HealthController } from './modules/health.controller';
import { StoreBootstrapService } from './shared/access/store-bootstrap.service';
import { PrismaModule } from './shared/infrastructure/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }], skipIf: () => process.env.THROTTLE_DISABLED === 'true' }),
    PrismaModule,
    AuditModule,
    AuthModule,
    CatalogModule,
    OrdersModule,
    CheckoutModule,
    ShippingModule,
    PromotionsModule,
    CustomersModule,
    StoreModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }, StoreBootstrapService],
})
export class AppModule {}
