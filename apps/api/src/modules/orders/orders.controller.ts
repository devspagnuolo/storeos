import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { OrderLifecycleService } from './order-lifecycle.service';
import { OrdersService } from './orders.service';
export class OrderItemDto { @IsString() productId!: string; @IsInt() @Min(1) @Max(999) quantity!: number; }
class CreateOrderDto { @IsString() customerId!: string; @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => OrderItemDto) items!: OrderItemDto[]; }
class ListOrdersQuery { @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number; @IsOptional() @IsString() status?: string; }
class TransitionDto { @IsOptional() @IsString() @MaxLength(280) message?: string; }
type AuthedRequest = { user: { sub: string } };
@ApiTags('Orders') @Controller('orders') export class OrdersController {
  constructor(private readonly orders: OrdersService, private readonly lifecycle: OrderLifecycleService) {}
  @Post() @RequirePermissions(Permissions.ORDERS_WRITE) create(@CurrentStore() storeId: string, @Body() dto: CreateOrderDto) { return this.orders.create(storeId, dto); }
  @Get() @RequirePermissions(Permissions.ORDERS_READ) list(@CurrentStore() storeId: string, @Query() query: ListOrdersQuery) { return this.orders.list(storeId, query); }
  @Get('summary') @RequirePermissions(Permissions.ORDERS_READ) summary(@CurrentStore() storeId: string) { return this.orders.summary(storeId); }
  @Get(':number') @RequirePermissions(Permissions.ORDERS_READ) byNumber(@CurrentStore() storeId: string, @Param('number') number: string) { return this.orders.byNumber(storeId, number); }
  @Post(':number/confirm-payment') @HttpCode(200) @RequirePermissions(Permissions.ORDERS_WRITE) async confirmPayment(@CurrentStore() storeId: string, @Param('number') number: string, @Body() dto: TransitionDto, @Req() req: AuthedRequest) { await this.lifecycle.markPaid({ storeId, number }, { actorId: req.user.sub, message: dto.message ?? 'Pagamento confirmado manualmente' }); return this.orders.byNumber(storeId, number); }
  @Post(':number/cancel') @HttpCode(200) @RequirePermissions(Permissions.ORDERS_WRITE) async cancel(@CurrentStore() storeId: string, @Param('number') number: string, @Body() dto: TransitionDto, @Req() req: AuthedRequest) { await this.lifecycle.cancel({ storeId, number }, { actorId: req.user.sub, message: dto.message ?? 'Pedido cancelado pela loja' }); return this.orders.byNumber(storeId, number); }
}
