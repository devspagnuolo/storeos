import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { OrderItemDto } from '../orders/orders.controller';
import { AbandonedCartsService } from './abandoned-carts.service';

class CaptureDto {
  @IsString() storeSlug!: string;
  @IsString() @MaxLength(180) email!: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => OrderItemDto) items!: OrderItemDto[];
}
class ListQuery { @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number; }

@ApiTags('Carrinhos abandonados') @Controller('abandoned-carts')
export class AbandonedCartsController {
  constructor(private readonly carts: AbandonedCartsService) {}

  @Post('capture') @HttpCode(200) @Throttle({ default: { limit: 20, ttl: 60_000 } }) capture(@Body() dto: CaptureDto) { return this.carts.capture(dto); }
  @Get('recover/:token') @Throttle({ default: { limit: 20, ttl: 60_000 } }) recover(@Param('token') token: string) { return this.carts.recover(token); }
  @Post('optout/:token') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60_000 } }) optOut(@Param('token') token: string) { return this.carts.optOut(token); }

  @Get('admin') @RequirePermissions(Permissions.ORDERS_READ) list(@CurrentStore() storeId: string, @Query() query: ListQuery) { return this.carts.list(storeId, query.pageSize); }
  @Post('admin/:id/remind') @HttpCode(200) @RequirePermissions(Permissions.ORDERS_WRITE) remind(@CurrentStore() storeId: string, @Param('id') id: string) { return this.carts.remindNow(storeId, id); }
}
