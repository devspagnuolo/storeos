import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StockMovementType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { InventoryService } from './inventory.service';
import { WarehousesService } from './warehouses.service';

class AdjustDto {
  @IsString() productId!: string;
  @IsOptional() @IsString() variantId?: string;
  @IsIn(['DELTA', 'SET']) mode!: 'DELTA' | 'SET';
  @IsInt() @Min(-1_000_000) @Max(1_000_000) quantity!: number;
  @IsString() @Length(3, 200) reason!: string;
}
class WarehouseDto { @IsString() @Length(2, 60) name!: string; }
class WarehouseUpdateDto { @IsOptional() @IsString() @Length(2, 60) name?: string; @IsOptional() @IsBoolean() active?: boolean; }
class WarehouseAdjustDto extends AdjustDto { @IsString() warehouseId!: string; }
class TransferDto {
  @IsString() productId!: string;
  @IsOptional() @IsString() variantId?: string;
  @IsString() fromId!: string;
  @IsString() toId!: string;
  @IsInt() @Min(1) @Max(1_000_000) quantity!: number;
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}
class MovementsQueryDto {
  @IsOptional() @IsString() @MaxLength(64) productId?: string;
  @IsOptional() @IsEnum(StockMovementType) type?: StockMovementType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}
class LowStockQueryDto { @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000) threshold?: number; }
type AuthedRequest = { user: { sub: string } };

@ApiTags('Inventory') @Controller('inventory') @RequirePermissions(Permissions.CATALOG_WRITE) export class InventoryController {
  constructor(private readonly inventory: InventoryService, private readonly warehouses: WarehousesService) {}
  @Post('adjust') @HttpCode(200) adjust(@CurrentStore() storeId: string, @Body() dto: AdjustDto, @Req() req: AuthedRequest) {
    if (dto.mode === 'SET' && dto.quantity < 0) dto.quantity = 0;
    return this.inventory.adjust(storeId, req.user.sub, dto);
  }
  @Get('items') items(@CurrentStore() storeId: string) { return this.inventory.items(storeId); }
  @Get('movements') movements(@CurrentStore() storeId: string, @Query() query: MovementsQueryDto) { return this.inventory.movements(storeId, query); }
  @Get('low-stock') lowStock(@CurrentStore() storeId: string, @Query() { threshold }: LowStockQueryDto) { return this.inventory.lowStock(storeId, threshold); }
  @Get('export.csv') @Header('Content-Type', 'text/csv; charset=utf-8') @Header('Content-Disposition', 'attachment; filename="estoque.csv"') exportCsv(@CurrentStore() storeId: string) { return this.inventory.exportCsv(storeId); }
  @Get('warehouses') listWarehouses(@CurrentStore() storeId: string) { return this.warehouses.list(storeId); }
  @Post('warehouses') createWarehouse(@CurrentStore() storeId: string, @Body() dto: WarehouseDto) { return this.warehouses.create(storeId, dto.name); }
  @Patch('warehouses/:id') updateWarehouse(@CurrentStore() storeId: string, @Param('id') id: string, @Body() dto: WarehouseUpdateDto) { return this.warehouses.update(storeId, id, dto); }
  @Delete('warehouses/:id') removeWarehouse(@CurrentStore() storeId: string, @Param('id') id: string) { return this.warehouses.remove(storeId, id); }
  @Get('warehouses-stock') warehouseStock(@CurrentStore() storeId: string) { return this.warehouses.matrix(storeId); }
  @Get('transfers') transfers(@CurrentStore() storeId: string) { return this.warehouses.transfers(storeId); }
  @Post('transfer') @HttpCode(200) transfer(@CurrentStore() storeId: string, @Body() dto: TransferDto, @Req() req: AuthedRequest) { return this.warehouses.transfer(storeId, req.user.sub, dto); }
  @Post('adjust-warehouse') @HttpCode(200) adjustWarehouse(@CurrentStore() storeId: string, @Body() dto: WarehouseAdjustDto, @Req() req: AuthedRequest) {
    if (dto.mode === 'SET' && dto.quantity < 0) dto.quantity = 0;
    return this.warehouses.adjust(storeId, req.user.sub, dto);
  }
}
