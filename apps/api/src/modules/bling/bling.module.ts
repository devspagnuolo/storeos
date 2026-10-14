import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { BlingAuthService } from './bling-auth.service';
import { BlingImportService } from './bling-import.service';
import { BlingOrdersService } from './bling-orders.service';
import { BlingWebhookService } from './bling-webhook.service';
import { BlingController } from './bling.controller';
import { BlingClient } from './bling.client';
@Module({ imports: [CatalogModule], controllers: [BlingController], providers: [BlingClient, BlingAuthService, BlingImportService, BlingOrdersService, BlingWebhookService], exports: [BlingOrdersService] }) export class BlingModule {}
