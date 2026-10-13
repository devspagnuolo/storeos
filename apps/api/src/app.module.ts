import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfig, AppConfigModule } from './config/app-config';
import { HealthController } from './modules/health/health.controller';
import { CartModule } from './modules/cart/cart.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { IdentityModule } from './modules/identity/identity.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { LoyaltyModule } from './modules/loyalty/loyalty.module';
import { MarketingModule } from './modules/marketing/marketing.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { AuditModule } from './shared/infrastructure/audit/audit.module';
import { CacheModule } from './shared/infrastructure/cache/cache.module';
import { CryptoModule } from './shared/infrastructure/crypto/crypto.module';
import { HttpModule } from './shared/infrastructure/http/http.module';
import { OutboxModule } from './shared/infrastructure/outbox/outbox.module';
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module';
import { AllExceptionsFilter } from './shared/presentation/filters/all-exceptions.filter';
import { AuthGuard } from './shared/presentation/guards/auth.guard';
import { RequestContextMiddleware } from './shared/presentation/middleware/request-context.middleware';
import { StoreResolverMiddleware } from './shared/presentation/middleware/store-resolver.middleware';

@Module({
  imports: [
    AppConfigModule,
    JwtModule.registerAsync({
      global: true,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({ secret: config.env.JWT_ACCESS_SECRET, verifyOptions: { algorithms: ['HS256'] } }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => [{ name: 'default', ttl: 60_000, limit: config.env.THROTTLE_LIMIT }],
    }),
    PrismaModule,
    CryptoModule,
    CacheModule,
    AuditModule,
    OutboxModule,
    HttpModule,
    IdentityModule,
    InventoryModule,
    CatalogModule,
    MarketingModule,
    ShippingModule,
    CartModule,
    OrdersModule,
    LoyaltyModule,
    PaymentsModule,
    CheckoutModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware, StoreResolverMiddleware).forRoutes('*');
  }
}
