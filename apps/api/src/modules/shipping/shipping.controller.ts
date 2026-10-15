import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Matches, Max, Min, ValidateIf, ValidateNested } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { OrderItemDto } from '../orders/orders.controller';
import { STATES } from './cep';
import { ShippingService } from './shipping.service';

class QuoteDto {
  @IsString() storeSlug!: string;
  @Matches(/^\d{5}-?\d{3}$/) zipCode!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => OrderItemDto) items!: OrderItemDto[];
}
class OriginDto { @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @Matches(/^(\d{5}-?\d{3})?$/) zipCode?: string | null; }
class CreateRuleDto {
  @IsString() @Length(2, 60) name!: string;
  @IsOptional() @IsArray() @IsIn(STATES, { each: true }) states?: string[];
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000) price!: number;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) freeAbove?: number | null;
  @IsOptional() @IsBoolean() freeOnly?: boolean;
  @IsInt() @Min(0) @Max(120) minDays!: number;
  @IsInt() @Min(0) @Max(120) maxDays!: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1000) position?: number;
}
class UpdateRuleDto {
  @IsOptional() @IsString() @Length(2, 60) name?: string;
  @IsOptional() @IsArray() @IsIn(STATES, { each: true }) states?: string[];
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000) price?: number;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) freeAbove?: number | null;
  @IsOptional() @IsBoolean() freeOnly?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(120) minDays?: number;
  @IsOptional() @IsInt() @Min(0) @Max(120) maxDays?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1000) position?: number;
}

@ApiTags('Shipping') @Controller('shipping') export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}
  @Post('quote') @HttpCode(200) @Throttle({ default: { limit: 60, ttl: 60_000 } }) quote(@Body() dto: QuoteDto) { return this.shipping.quote(dto.storeSlug, dto.zipCode, dto.items); }
  /** Painel: mostra se a cotação em transportadoras está ligada. */
  @Get('carrier') @RequirePermissions(Permissions.SETTINGS_WRITE) carrierStatus(@CurrentStore() storeId: string) { return this.shipping.carrierStatus(storeId); }
  /** CEP de onde a loja despacha, editável sem mexer nas variáveis do servidor. Vazio volta a usar o do servidor. */
  @Put('origin') @RequirePermissions(Permissions.SETTINGS_WRITE) setOrigin(@CurrentStore() storeId: string, @Body() dto: OriginDto) { return this.shipping.setOriginZip(storeId, dto.zipCode ?? null); }
  @Get('rules') @RequirePermissions(Permissions.SETTINGS_WRITE) list(@CurrentStore() storeId: string) { return this.shipping.list(storeId); }
  @Post('rules') @RequirePermissions(Permissions.SETTINGS_WRITE) create(@CurrentStore() storeId: string, @Body() dto: CreateRuleDto) { return this.shipping.create(storeId, dto); }
  @Patch('rules/:id') @RequirePermissions(Permissions.SETTINGS_WRITE) update(@CurrentStore() storeId: string, @Param('id') id: string, @Body() dto: UpdateRuleDto) { return this.shipping.update(storeId, id, dto); }
  @Delete('rules/:id') @HttpCode(204) @RequirePermissions(Permissions.SETTINGS_WRITE) remove(@CurrentStore() storeId: string, @Param('id') id: string) { return this.shipping.remove(storeId, id); }
}
