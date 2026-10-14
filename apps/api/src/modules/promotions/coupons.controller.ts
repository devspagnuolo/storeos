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
import { mergeItems, priceOrderLines } from '../orders/order-lines';
import { OrderItemDto } from '../orders/orders.controller';
import { ProductStatus } from '@prisma/client';
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
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() startsAt?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() endsAt?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}
class UpdateCouponDto {
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minSubtotal?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) maxUses?: number | null;
  @IsOptional() @IsBoolean() oncePerCustomer?: boolean;
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
  @Patch(':id') @RequirePermissions(Permissions.MARKETING_WRITE) update(@CurrentStore() storeId: string, @Param('id') id: string, @Body() dto: UpdateCouponDto) { return this.coupons.update(storeId, id, dto); }

  /** Público: a vitrine mostra o desconto antes de finalizar. A regra de verdade roda de novo no checkout. */
  @Post('preview') @HttpCode(200) @Throttle({ default: { limit: 20, ttl: 60_000 } }) async preview(@Body() dto: PreviewDto) {
    const store = await this.prisma.store.findUnique({ where: { slug: dto.storeSlug } });
    if (!store) throw new NotFoundException('Loja não encontrada');
    const products = await this.prisma.product.findMany({ where: { storeId: store.id, id: { in: dto.items.map(i => i.productId) }, status: ProductStatus.ACTIVE } });
    const { lines, subtotal } = priceOrderLines(mergeItems(dto.items), products);
    // Mesma ordem do checkout: promoções automáticas primeiro, cupom sobre o restante.
    const { discount } = await this.promotions.evaluate(this.prisma, store.id, lines);
    return this.coupons.preview(store.id, dto.code, subtotal.minus(discount), money(dto.shipping ?? 0));
  }
}
