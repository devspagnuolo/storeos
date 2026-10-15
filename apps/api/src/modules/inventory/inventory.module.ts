import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { WarehousesService } from './warehouses.service';
@Module({ controllers: [InventoryController], providers: [InventoryService, WarehousesService] }) export class InventoryModule {}
