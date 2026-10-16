import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length, Matches, MaxLength, ValidateNested } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { FulfillmentAutomationService } from './fulfillment-automation.service';

class SenderDto {
  @IsString() @Length(2, 80) name!: string;
  @Matches(/^(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})$/, { message: 'CPF ou CNPJ inválido' }) document!: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsString() @Length(1, 160) street!: string;
  @IsString() @Length(1, 20) number!: string;
  @IsOptional() @IsString() @MaxLength(80) complement?: string;
  @IsString() @Length(1, 80) district!: string;
  @IsString() @Length(1, 80) city!: string;
  @Matches(/^[A-Z]{2}$/) state!: string;
}
class AutomationDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @ValidateNested() @Type(() => SenderDto) sender?: SenderDto;
}

@ApiTags('Fulfillment') @Controller() export class FulfillmentController {
  constructor(private readonly automation: FulfillmentAutomationService) {}
  @Get('fulfillment/automation') @RequirePermissions(Permissions.SETTINGS_WRITE) settings(@CurrentStore() storeId: string) { return this.automation.settings(storeId); }
  @Put('fulfillment/automation') @RequirePermissions(Permissions.SETTINGS_WRITE) save(@CurrentStore() storeId: string, @Body() dto: AutomationDto) { return this.automation.saveSettings(storeId, dto); }
  @Post('orders/:number/label') @HttpCode(200) @RequirePermissions(Permissions.ORDERS_WRITE) label(@CurrentStore() storeId: string, @Param('number') number: string) { return this.automation.requestLabel(storeId, number); }
}
