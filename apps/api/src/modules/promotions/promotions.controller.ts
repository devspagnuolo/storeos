import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { ProductStatus, PromotionType } from '@prisma/client';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { mergeItems, priceOrderLines } from '../orders/order-lines';
import { OrderItemDto } from '../orders/orders.controller';
import { PromotionsService } from './promotions.service';

class PromotionDto {
  @IsString() @Length(2, 80) name!: string;
  @IsEnum(PromotionType) type!: PromotionType;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) value?: number;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(2) @Max(100) buyQty?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(100) payQty?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minSubtotal?: number | null;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) @MaxLength(64, { each: true }) skus?: string[];
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() startsAt?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() endsAt?: string | null;
}
class UpdatePromotionDto {
  @IsOptional() @IsString() @Length(2, 80) name?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) value?: number;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(2) @Max(100) buyQty?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(100) payQty?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minSubtotal?: number | null;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) @MaxLength(64, { each: true }) skus?: string[];
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() startsAt?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() endsAt?: string | null;
}
class PromotionPreviewDto {
  @IsString() storeSlug!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => OrderItemDto) items!: OrderItemDto[];
}

@ApiTags('Promotions') @Controller('promotions') export class PromotionsController {
  constructor(private readonly promotions: PromotionsService, private readonly prisma: PrismaService) {}
  @Get() @RequirePermissions(Permissions.MARKETING_WRITE) list(@CurrentStore() storeId: string) { return this.promotions.list(storeId); }
  @Post() @RequirePermissions(Permissions.MARKETING_WRITE) create(@CurrentStore() storeId: string, @Body() dto: PromotionDto) { return this.promotions.create(storeId, dto); }
  @Patch(':id') @RequirePermissions(Permissions.MARKETING_WRITE) update(@CurrentStore() storeId: string, @Param('id') id: string, @Body() dto: UpdatePromotionDto) { return this.promotions.update(storeId, id, dto); }
  @Delete(':id') @HttpCode(204) @RequirePermissions(Permissions.MARKETING_WRITE) remove(@CurrentStore() storeId: string, @Param('id') id: string) { return this.promotions.remove(storeId, id); }

  /** Público: o carrinho mostra as promoções aplicadas; o checkout recalcula tudo de novo. */
  @Post('preview') @HttpCode(200) @Throttle({ default: { limit: 30, ttl: 60_000 } }) async preview(@Body() dto: PromotionPreviewDto) {
    const store = await this.prisma.store.findUnique({ where: { slug: dto.storeSlug } });
    if (!store) throw new NotFoundException('Loja não encontrada');
    const products = await this.prisma.product.findMany({ where: { storeId: store.id, id: { in: dto.items.map(i => i.productId) }, status: ProductStatus.ACTIVE } });
    const { lines, subtotal } = priceOrderLines(mergeItems(dto.items), products);
    const { discount, applied } = await this.promotions.evaluate(this.prisma, store.id, lines);
    return { subtotal: subtotal.toFixed(2), discount: discount.toFixed(2), total: subtotal.minus(discount).toFixed(2), applied };
  }
}
