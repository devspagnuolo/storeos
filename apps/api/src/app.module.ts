import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { AccountModule } from './modules/account/account.module';
import { OrdersModule } from './modules/orders/orders.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { CustomersModule } from './modules/customers/customers.module';
import { LoyaltyModule } from './modules/loyalty/loyalty.module';
import { ContentModule } from './modules/content/content.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { AbandonedCartsModule } from './modules/abandoned-carts/abandoned-carts.module';
import { EngagementModule } from './modules/engagement/engagement.module';
import { BlingModule } from './modules/bling/bling.module';
import { MediaModule } from './modules/media/media.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { DiagnosticsModule } from './modules/diagnostics/diagnostics.module';
import { RedirectsModule } from './modules/redirects/redirects.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { SeoModule } from './modules/seo/seo.module';
import { MarketingModule } from './modules/marketing/marketing.module';
import { AutomationsModule } from './modules/automations/automations.module';
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
    AccountModule,
    ShippingModule,
    PromotionsModule,
    InventoryModule,
    AbandonedCartsModule,
    EngagementModule,
    MarketingModule,
    AutomationsModule,
    SeoModule,
    RedirectsModule,
    ReviewsModule,
    OnboardingModule,
    MediaModule,
    BlingModule,
    NotificationsModule,
    ContentModule,
    LoyaltyModule,
    CustomersModule,
    AnalyticsModule,
    StoreModule,
    DiagnosticsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }, StoreBootstrapService],
})
export class AppModule {}
