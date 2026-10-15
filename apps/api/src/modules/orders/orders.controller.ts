import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { ManualOrdersService } from './manual-orders.service';
import { OrderLifecycleService } from './order-lifecycle.service';
import { OrdersService } from './orders.service';
export class OrderItemDto { @IsString() productId!: string; @IsOptional() @IsString() variantId?: string; @IsInt() @Min(1) @Max(999) quantity!: number; }
class CreateOrderDto { @IsString() customerId!: string; @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => OrderItemDto) items!: OrderItemDto[]; }
class ListOrdersQuery { @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number; @IsOptional() @IsString() status?: string; @IsOptional() @IsString() @MaxLength(120) q?: string; }
class ManualItemDto { @IsString() productId!: string; @IsOptional() @IsString() variantId?: string; @IsInt() @Min(1) @Max(999) quantity!: number; @IsOptional() unitPrice?: unknown; }
class ManualCustomerDto { @IsString() @MaxLength(120) name!: string; @IsEmail() @MaxLength(200) email!: string; @IsOptional() @IsString() @MaxLength(30) phone?: string; @IsOptional() @IsString() @MaxLength(20) document?: string; }
class ManualAddressDto { @IsString() @MaxLength(9) zipCode!: string; @IsString() @MaxLength(160) street!: string; @IsString() @MaxLength(20) number!: string; @IsOptional() @IsString() @MaxLength(80) complement?: string; @IsOptional() @IsString() @MaxLength(80) district?: string; @IsString() @MaxLength(80) city!: string; @IsString() @MaxLength(2) state!: string; }
class ManualOrderDto {
  @ValidateNested() @Type(() => ManualCustomerDto) customer!: ManualCustomerDto;
  @IsOptional() @ValidateNested() @Type(() => ManualAddressDto) shippingAddress?: ManualAddressDto;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ManualItemDto) items!: ManualItemDto[];
  @IsEnum(PaymentMethod) paymentMethod!: PaymentMethod;
  @IsOptional() @IsBoolean() paid?: boolean;
  @IsOptional() discount?: unknown;
  @IsOptional() shipping?: unknown;
  @IsOptional() @IsString() @MaxLength(80) shippingMethod?: string;
  @IsOptional() @IsString() @MaxLength(280) note?: string;
}
class InvoiceDto { @IsString() @MaxLength(60) invoiceNumber!: string; @IsOptional() @IsString() @MaxLength(60) invoiceKey?: string; }
class ShipDto { @IsString() @MaxLength(80) carrier!: string; @IsString() @MaxLength(80) trackingCode!: string; @IsOptional() @IsString() @MaxLength(500) trackingUrl?: string; }
class ReturnDto { @IsString() @MaxLength(280) reason!: string; @IsOptional() @IsBoolean() restock?: boolean; }
class TransitionDto { @IsOptional() @IsString() @MaxLength(280) message?: string; }
type AuthedRequest = { user: { sub: string } };
@ApiTags('Orders') @Controller('orders') export class OrdersController {
  constructor(private readonly orders: OrdersService, private readonly lifecycle: OrderLifecycleService, private readonly manual: ManualOrdersService) {}
  @Post() @RequirePermissions(Permissions.ORDERS_WRITE) create(@CurrentStore() storeId: string, @Body() dto: CreateOrderDto) { return this.orders.create(storeId, dto); }
  @Post('manual') @RequirePermissions(Permissions.ORDERS_WRITE) createManual(@CurrentStore() storeId: string, @Body() dto: ManualOrderDto, @Req() req: AuthedRequest) { return this.manual.create(storeId, dto, req.user.sub); }
  @Get() @RequirePermissions(Permissions.ORDERS_READ) list(@CurrentStore() storeId: string, @Query() query: ListOrdersQuery) { return this.orders.list(storeId, query); }
  @Get('summary') @RequirePermissions(Permissions.ORDERS_READ) summary(@CurrentStore() storeId: string) { return this.orders.summary(storeId); }
  @Get(':number') @RequirePermissions(Permissions.ORDERS_READ) byNumber(@CurrentStore() storeId: string, @Param('number') number: string) { return this.orders.byNumber(storeId, number); }
  @Post(':number/confirm-payment') @HttpCode(200) @RequirePermissions(Permissions.ORDERS_WRITE) async confirmPayment(@CurrentStore() storeId: string, @Param('number') number: string, @Body() dto: TransitionDto, @Req() req: AuthedRequest) { await this.lifecycle.markPaid({ storeId, number }, { actorId: req.user.sub, message: dto.message ?? 'Pagamento confirmado manualmente' }); return this.orders.byNumber(storeId, number); }
  @Post(':number/cancel') @HttpCode(200) @RequirePermissions(Permissions.ORDERS_WRITE) async cancel(@CurrentStore() storeId: string, @Param('number') number: string, @Body() dto: TransitionDto, @Req() req: AuthedRequest) { await this.lifecycle.cancel({ storeId, number }, { actorId: req.user.sub, message: dto.message ?? 'Pedido cancelado pela loja' }); return this.orders.byNumber(storeId, number); }
  @Post(':number/pick') @HttpCode(200) @RequirePermissions(Permissions.ORDERS_WRITE) async pick(@CurrentStore() storeId: string, @Param('number') number: string, @Req() req: AuthedRequest) { await this.lifecycle.startPicking({ storeId, number }, { actorId: req.user.sub }); return this.orders.byNumber(storeId, number); }
  @Post(':number/invoice') @HttpCode(200) @RequirePermissions(Permissions.ORDERS_WRITE) async invoice(@CurrentStore() storeId: string, @Param('number') number: string, @Body() dto: InvoiceDto, @Req() req: AuthedRequest) { await this.lifecycle.markInvoiced({ storeId, number }, dto, { actorId: req.user.sub }); return this.orders.byNumber(storeId, number); }
  @Post(':number/ship') @HttpCode(200) @RequirePermissions(Permissions.ORDERS_WRITE) async ship(@CurrentStore() storeId: string, @Param('number') number: string, @Body() dto: ShipDto, @Req() req: AuthedRequest) { await this.lifecycle.markShipped({ storeId, number }, dto, { actorId: req.user.sub }); return this.orders.byNumber(storeId, number); }
  @Post(':number/deliver') @HttpCode(200) @RequirePermissions(Permissions.ORDERS_WRITE) async deliver(@CurrentStore() storeId: string, @Param('number') number: string, @Req() req: AuthedRequest) { await this.lifecycle.markDelivered({ storeId, number }, { actorId: req.user.sub }); return this.orders.byNumber(storeId, number); }
  @Post(':number/return') @HttpCode(200) @RequirePermissions(Permissions.ORDERS_WRITE) async returned(@CurrentStore() storeId: string, @Param('number') number: string, @Body() dto: ReturnDto, @Req() req: AuthedRequest) { await this.lifecycle.markReturned({ storeId, number }, dto, { actorId: req.user.sub }); return this.orders.byNumber(storeId, number); }
}
