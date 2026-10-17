import { Body, Controller, HttpCode, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { OrderItemDto } from '../orders/orders.controller';
import { CheckoutService } from './checkout.service';
import { CheckoutDraftService } from './checkout-draft.service';
class CustomerDto { @IsString() @Length(2, 120) name!: string; @IsEmail() @MaxLength(180) email!: string; @IsOptional() @Matches(/^[\d ()+-]{8,20}$/) phone?: string; }
class AddressDto { @Matches(/^\d{5}-?\d{3}$/) zipCode!: string; @IsString() @Length(1, 160) street!: string; @IsString() @Length(1, 20) number!: string; @IsOptional() @IsString() @MaxLength(80) complement?: string; @IsOptional() @IsString() @MaxLength(80) district?: string; @IsString() @Length(1, 80) city!: string; @Matches(/^[A-Z]{2}$/) state!: string; }
class CardDto {
  @IsOptional() @IsString() @Length(8, 128) token?: string; @IsOptional() @IsString() @MaxLength(40) paymentMethodId?: string; @IsOptional() @IsInt() @Min(1) @Max(18) installments?: number; @IsOptional() @IsString() @MaxLength(20) issuerId?: string;
  @IsOptional() @Matches(/^\d{6,8}$/) bin?: string;
}
class LoyaltyRewardDto { @IsString() @Length(8, 80) checkoutId!: string; @IsString() @Length(8, 24) code!: string; }
class CheckoutDto {
  @IsString() storeSlug!: string;
  @ValidateNested() @Type(() => CustomerDto) customer!: CustomerDto;
  @ValidateNested() @Type(() => AddressDto) shippingAddress!: AddressDto;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => OrderItemDto) items!: OrderItemDto[];
  @IsEnum(PaymentMethod) paymentMethod!: PaymentMethod;
  @IsOptional() @IsString() shippingRuleId?: string;
  @IsOptional() @IsString() @MaxLength(32) couponCode?: string;
  @IsString() @Length(11, 14) cpf!: string;
  @IsOptional() @ValidateNested() @Type(() => CardDto) card?: CardDto;
  @IsOptional() @ValidateNested() @Type(() => LoyaltyRewardDto) loyaltyReward?: LoyaltyRewardDto;
}
class DraftTokenDto { @IsString() storeSlug!: string; @IsUUID() token!: string; }
class SaveDraftDto extends DraftTokenDto { @IsOptional() @IsString() @MaxLength(14) cpf?: string; @IsObject() data!: Record<string, unknown>; }
class IdentifyDto extends DraftTokenDto { @IsString() @Length(11, 14) cpf!: string; }
class ConfirmDto extends IdentifyDto { @IsEmail() @MaxLength(180) email!: string; }

@ApiTags('Checkout') @Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService, private readonly drafts: CheckoutDraftService) {}

  @Post() @Throttle({ default: { limit: 10, ttl: 60_000 } }) checkout(@Body() dto: CheckoutDto) { return this.checkoutService.checkout(dto); }
  /** Gravado a cada campo preenchido; o limite cobre digitação normal com folga. */
  @Put('draft') @HttpCode(200) @Throttle({ default: { limit: 120, ttl: 60_000 } }) saveDraft(@Body() dto: SaveDraftDto) { return this.drafts.save(dto); }
  @Post('identify') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60_000 } }) identify(@Body() dto: IdentifyDto) { return this.drafts.identify(dto); }
  /** Limite baixo: confirmar o e-mail libera dados pessoais, então tentativas em série são barradas. */
  @Post('identify/confirm') @HttpCode(200) @Throttle({ default: { limit: 5, ttl: 60_000 } }) confirm(@Body() dto: ConfirmDto) { return this.drafts.confirm(dto); }
}
