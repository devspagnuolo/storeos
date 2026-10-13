import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersModule } from '../orders/orders.module';
import { ErpSyncService } from './application/erp-sync.service';
import { IntegrationsService } from './application/integrations.service';
import { SyncWorker } from './application/sync-worker';
import { IntegrationsAdminController } from './presentation/integrations-admin.controller';
import { ErpWebhookController } from './presentation/erp-webhook.controller';
import { BlingProvider } from './providers/bling.provider';

@Module({
  imports: [InventoryModule, OrdersModule],
  controllers: [IntegrationsAdminController, ErpWebhookController],
  providers: [BlingProvider, IntegrationsService, ErpSyncService, SyncWorker],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
