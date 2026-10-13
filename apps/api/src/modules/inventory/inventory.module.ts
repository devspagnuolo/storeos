import { Module } from '@nestjs/common';
import { InventoryService } from './application/inventory.service';
import { ReservationExpiryJob } from './application/reservation-expiry.job';
import { InventoryController } from './presentation/inventory.controller';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, ReservationExpiryJob],
  exports: [InventoryService],
})
export class InventoryModule {}
