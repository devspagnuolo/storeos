import { Body, Controller, Delete, Get, Headers, HttpCode, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { AccountService } from '../account/account.service';
import { FidelizeiService } from './fidelizei.service';

class SettingsDto {
  @IsOptional() @IsString() @MaxLength(400) apiKey?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() @MaxLength(40) termsVersion?: string;
  @IsOptional() @IsString() @MaxLength(40) privacyVersion?: string;
  @IsOptional() @IsString() @MaxLength(300) termsUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(300) privacyUrl?: string | null;
}
class EnrollDto { @IsOptional() @IsString() @MaxLength(14) cpf?: string; @IsBoolean() consent!: boolean; }
class ReserveDto { @IsString() @MaxLength(120) rewardId!: string; @IsNumber() subtotal!: number; }
class ReleaseDto { @IsString() @MaxLength(80) checkoutId!: string; }

/** Painel: chave da API, textos de adesão e benefícios usados nos pedidos. */
@ApiTags('Fidelizei') @Controller('fidelizei')
export class FidelizeiController {
  constructor(private readonly fidelizei: FidelizeiService) {}

  @Get('settings') @RequirePermissions(Permissions.SETTINGS_WRITE)
  settings(@CurrentStore() storeId: string) { return this.fidelizei.settings(storeId); }

  @Put('settings') @RequirePermissions(Permissions.SETTINGS_WRITE)
  save(@CurrentStore() storeId: string, @Body() dto: SettingsDto) { return this.fidelizei.saveSettings(storeId, dto); }

  @Post('test') @HttpCode(200) @RequirePermissions(Permissions.SETTINGS_WRITE)
  test(@CurrentStore() storeId: string) { return this.fidelizei.test(storeId); }

  @Delete('connection') @HttpCode(204) @RequirePermissions(Permissions.SETTINGS_WRITE)
  disconnect(@CurrentStore() storeId: string) { return this.fidelizei.disconnect(storeId); }

  @Get('redemptions') @RequirePermissions(Permissions.ORDERS_READ)
  redemptions(@CurrentStore() storeId: string) { return this.fidelizei.redemptions(storeId); }
}

/** Área do cliente: adesão ao programa, saldo, benefícios e reserva de um benefício para o checkout. */
@ApiTags('Fidelizei') @Controller('account/fidelizei')
export class FidelizeiAccountController {
  constructor(private readonly fidelizei: FidelizeiService, private readonly account: AccountService) {}

  @Get()
  async loyalty(@Headers('x-customer-token') token?: string) { const ctx = await this.account.authenticate(token); return this.fidelizei.loyalty(ctx.storeId, ctx.customerId); }

  @Post('enroll') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async enroll(@Body() dto: EnrollDto, @Headers('x-customer-token') token?: string) { const ctx = await this.account.authenticate(token); return this.fidelizei.enroll(ctx.storeId, ctx.customerId, dto); }

  @Post('reserve') @HttpCode(200) @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async reserve(@Body() dto: ReserveDto, @Headers('x-customer-token') token?: string) { const ctx = await this.account.authenticate(token); return this.fidelizei.reserve(ctx.storeId, ctx.customerId, dto); }

  @Post('release') @HttpCode(200)
  async release(@Body() dto: ReleaseDto, @Headers('x-customer-token') token?: string) { const ctx = await this.account.authenticate(token); return this.fidelizei.release(ctx.storeId, ctx.customerId, dto.checkoutId); }
}
