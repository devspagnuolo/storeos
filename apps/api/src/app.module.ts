import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { OrdersModule } from './modules/orders/orders.module';
import { HealthController } from './modules/health.controller';
import { PrismaService } from './shared/infrastructure/prisma.service';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule, CatalogModule, OrdersModule], controllers: [HealthController], providers: [PrismaService] })
export class AppModule {}
