import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { OrdersService } from './orders.service';
export class OrderItemDto { @IsString() productId!: string; @IsInt() @Min(1) @Max(999) quantity!: number; }
class CreateOrderDto { @IsString() customerId!: string; @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => OrderItemDto) items!: OrderItemDto[]; }
class ListOrdersQuery { @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number; }
@ApiTags('Orders') @Controller('orders') export class OrdersController { constructor(private readonly orders: OrdersService) {} @Post() @RequirePermissions(Permissions.ORDERS_WRITE) create(@CurrentStore() storeId: string, @Body() dto: CreateOrderDto) { return this.orders.create(storeId, dto); } @Get() @RequirePermissions(Permissions.ORDERS_READ) list(@CurrentStore() storeId: string, @Query() query: ListOrdersQuery) { return this.orders.list(storeId, query.page, query.pageSize); } @Get(':number') @RequirePermissions(Permissions.ORDERS_READ) byNumber(@CurrentStore() storeId: string, @Param('number') number: string) { return this.orders.byNumber(storeId, number); } }
