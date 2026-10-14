import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsEnum, IsOptional, IsString, Length, Matches, MaxLength, ValidateNested } from 'class-validator';
import { OrderItemDto } from '../orders/orders.controller';
import { CheckoutService } from './checkout.service';
class CustomerDto { @IsString() @Length(2, 120) name!: string; @IsEmail() @MaxLength(180) email!: string; }
class AddressDto { @Matches(/^\d{5}-?\d{3}$/) zipCode!: string; @IsString() @Length(1, 160) street!: string; @IsString() @Length(1, 20) number!: string; @IsOptional() @IsString() @MaxLength(80) complement?: string; @IsOptional() @IsString() @MaxLength(80) district?: string; @IsString() @Length(1, 80) city!: string; @Matches(/^[A-Z]{2}$/) state!: string; }
class CheckoutDto {
  @IsString() storeSlug!: string;
  @ValidateNested() @Type(() => CustomerDto) customer!: CustomerDto;
  @ValidateNested() @Type(() => AddressDto) shippingAddress!: AddressDto;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => OrderItemDto) items!: OrderItemDto[];
  @IsEnum(PaymentMethod) paymentMethod!: PaymentMethod;
  @IsOptional() @IsString() shippingRuleId?: string;
  @IsOptional() @IsString() @MaxLength(32) couponCode?: string;
}
@ApiTags('Checkout') @Controller('checkout') export class CheckoutController { constructor(private readonly checkoutService: CheckoutService) {} @Post() @Throttle({ default: { limit: 10, ttl: 60_000 } }) checkout(@Body() dto: CheckoutDto) { return this.checkoutService.checkout(dto); } }
