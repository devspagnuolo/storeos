import { Body, Controller, Get, Header, HttpCode, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StockMovementType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { InventoryService } from './inventory.service';

class AdjustDto {
  @IsString() productId!: string;
  @IsOptional() @IsString() variantId?: string;
  @IsIn(['DELTA', 'SET']) mode!: 'DELTA' | 'SET';
  @IsInt() @Min(-1_000_000) @Max(1_000_000) quantity!: number;
  @IsString() @Length(3, 200) reason!: string;
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
  constructor(private readonly inventory: InventoryService) {}
  @Post('adjust') @HttpCode(200) adjust(@CurrentStore() storeId: string, @Body() dto: AdjustDto, @Req() req: AuthedRequest) {
    if (dto.mode === 'SET' && dto.quantity < 0) dto.quantity = 0;
    return this.inventory.adjust(storeId, req.user.sub, dto);
  }
  @Get('items') items(@CurrentStore() storeId: string) { return this.inventory.items(storeId); }
  @Get('movements') movements(@CurrentStore() storeId: string, @Query() query: MovementsQueryDto) { return this.inventory.movements(storeId, query); }
  @Get('low-stock') lowStock(@CurrentStore() storeId: string, @Query() { threshold }: LowStockQueryDto) { return this.inventory.lowStock(storeId, threshold); }
  @Get('export.csv') @Header('Content-Type', 'text/csv; charset=utf-8') @Header('Content-Disposition', 'attachment; filename="estoque.csv"') exportCsv(@CurrentStore() storeId: string) { return this.inventory.exportCsv(storeId); }
}
