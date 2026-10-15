import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { OrdersModule } from '../orders/orders.module';
import { BlingAuthService } from './bling-auth.service';
import { BlingImportService } from './bling-import.service';
import { BlingOrdersService } from './bling-orders.service';
import { BlingInvoicesService } from './bling-invoices.service';
import { BlingTrackingService } from './bling-tracking.service';
import { BlingStockService } from './bling-stock.service';
import { BlingWebhookService } from './bling-webhook.service';
import { BlingController } from './bling.controller';
import { BlingClient } from './bling.client';
@Module({ imports: [CatalogModule, OrdersModule], controllers: [BlingController], providers: [BlingClient, BlingAuthService, BlingImportService, BlingOrdersService, BlingInvoicesService, BlingWebhookService, BlingStockService, BlingTrackingService], exports: [BlingOrdersService] }) export class BlingModule {}
