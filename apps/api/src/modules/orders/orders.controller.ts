import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsString, ValidateNested } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { OrdersService } from './orders.service';
class ItemDto { @IsString() productId!: string; @IsInt() quantity!: number; }
class CreateOrderDto { @IsString() customerId!: string; @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ItemDto) items!: ItemDto[]; }
@ApiTags('Orders') @Controller('orders') export class OrdersController { constructor(private readonly orders: OrdersService) {} @Post() @UseGuards(JwtAuthGuard) @ApiBearerAuth() create(@CurrentStore() storeId: string, @Body() dto: CreateOrderDto) { return this.orders.create(storeId, dto); } }
