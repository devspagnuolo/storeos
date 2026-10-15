import { Body, Controller, Get, HttpCode, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { CouponType } from '@prisma/client';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { money } from '../../shared/money/money';
import { mergeItems, priceOrderLines, productsForPricing } from '../orders/order-lines';
import { OrderItemDto } from '../orders/orders.controller';
import { CouponsService } from './coupons.service';
import { PromotionsService } from './promotions.service';

class CreateCouponDto {
  @IsString() @Length(3, 32) @Matches(/^[A-Za-z0-9_-]+$/) code!: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsEnum(CouponType) type!: CouponType;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000) value?: number;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minSubtotal?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) maxUses?: number | null;
  @IsOptional() @IsBoolean() oncePerCustomer?: boolean;
  @IsOptional() @IsBoolean() firstOrderOnly?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) productIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) categoryIds?: string[];
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() startsAt?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() endsAt?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}
class BulkCouponDto {
  @IsString() @Length(2, 16) @Matches(/^[A-Za-z0-9_-]+$/) prefix!: string;
  @IsInt() @Min(1) @Max(500) count!: number;
  @IsString() @Length(2, 60) campaign!: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsEnum(CouponType) type!: CouponType;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000) value?: number;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minSubtotal?: number | null;
  @IsOptional() @IsBoolean() oncePerCustomer?: boolean;
  @IsOptional() @IsBoolean() firstOrderOnly?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) productIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) categoryIds?: string[];
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() startsAt?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() endsAt?: string | null;
}
class CampaignActiveDto { @IsBoolean() active!: boolean; }
class UpdateCouponDto {
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minSubtotal?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) maxUses?: number | null;
  @IsOptional() @IsBoolean() oncePerCustomer?: boolean;
  @IsOptional() @IsBoolean() firstOrderOnly?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) productIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) categoryIds?: string[];
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() startsAt?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() endsAt?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}
class PreviewDto {
  @IsString() storeSlug!: string;
  @IsString() @Length(1, 32) code!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => OrderItemDto) items!: OrderItemDto[];
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) shipping?: number;
}

@ApiTags('Coupons') @Controller('coupons') export class CouponsController {
  constructor(private readonly coupons: CouponsService, private readonly promotions: PromotionsService, private readonly prisma: PrismaService) {}
  @Get() @RequirePermissions(Permissions.MARKETING_WRITE) list(@CurrentStore() storeId: string) { return this.coupons.list(storeId); }
  @Post() @RequirePermissions(Permissions.MARKETING_WRITE) create(@CurrentStore() storeId: string, @Body() dto: CreateCouponDto) { return this.coupons.create(storeId, dto); }
  @Get('campaigns') @RequirePermissions(Permissions.MARKETING_WRITE) campaigns(@CurrentStore() storeId: string) { return this.coupons.campaigns(storeId); }
  @Get('campaigns/:name') @RequirePermissions(Permissions.MARKETING_WRITE) campaignCodes(@CurrentStore() storeId: string, @Param('name') name: string) { return this.coupons.campaignCodes(storeId, name); }
  @Patch('campaigns/:name') @RequirePermissions(Permissions.MARKETING_WRITE) setCampaign(@CurrentStore() storeId: string, @Param('name') name: string, @Body() dto: CampaignActiveDto) { return this.coupons.setCampaignActive(storeId, name, dto.active); }
  @Post('bulk') @RequirePermissions(Permissions.MARKETING_WRITE) bulk(@CurrentStore() storeId: string, @Body() dto: BulkCouponDto) { return this.coupons.createBulk(storeId, dto); }
  @Patch(':id') @RequirePermissions(Permissions.MARKETING_WRITE) update(@CurrentStore() storeId: string, @Param('id') id: string, @Body() dto: UpdateCouponDto) { return this.coupons.update(storeId, id, dto); }

  /** Público: a vitrine mostra o desconto antes de finalizar. A regra de verdade roda de novo no checkout. */
  @Post('preview') @HttpCode(200) @Throttle({ default: { limit: 20, ttl: 60_000 } }) async preview(@Body() dto: PreviewDto) {
    const store = await this.prisma.store.findUnique({ where: { slug: dto.storeSlug } });
    if (!store) throw new NotFoundException('Loja não encontrada');
    const items = mergeItems(dto.items);
    const products = await productsForPricing(this.prisma, store.id, items);
    const { lines, subtotal } = priceOrderLines(items, products);
    // Mesma ordem do checkout: promoções automáticas primeiro, cupom sobre o restante.
    const { discount } = await this.promotions.evaluate(this.prisma, store.id, lines);
    return this.coupons.preview(store.id, dto.code, subtotal, subtotal.minus(discount), lines, money(dto.shipping ?? 0));
  }
}
