import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { MercadoPagoClient } from './mercado-pago.client';
import { MAX_INSTALLMENTS } from './payment-rules';
import { PaymentRouter } from './payment-router';
import { PaymentRulesService } from './payment-rules.service';

class ConfigQueryDto { @IsOptional() @IsString() @MaxLength(80) store?: string; }
class RulesDto {
  @IsInt() @Min(1) @Max(MAX_INSTALLMENTS) maxInstallments!: number;
  @IsInt() @Min(1) @Max(MAX_INSTALLMENTS) maxFreeInstallments!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000) minFreeInstallment!: number;
}
class SimulationDto { @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(1_000_000) amount!: number; }

/** O que o navegador precisa para tokenizar o cartão e aplicar os limites de parcelas da loja. */
@ApiTags('Pagamentos')
@Controller('payments')
export class PaymentsConfigController {
  constructor(private readonly client: MercadoPagoClient, private readonly router: PaymentRouter, private readonly rules: PaymentRulesService) {}

  @Get('config')
  async config(@Query() { store }: ConfigQueryDto) {
    const gateway = this.router.cardGateway();
    const limits = await this.rules.limitsBySlug(store);
    const boleto = this.client.configured;
    return { card: gateway === 'mercadopago' ? { provider: 'mercadopago', publicKey: this.client.publicKey, maxInstallments: limits.max, maxFreeInstallments: limits.maxFree, minFreeInstallment: limits.minFree } : null, boleto };
  }

  /** Painel: regras de parcelamento da loja. */
  @Get('rules') @RequirePermissions(Permissions.SETTINGS_WRITE) getRules(@CurrentStore() storeId: string) { return this.rules.get(storeId); }
  @Put('rules') @RequirePermissions(Permissions.SETTINGS_WRITE) setRules(@CurrentStore() storeId: string, @Body() dto: RulesDto) { return this.rules.update(storeId, dto); }
  /** Painel: simulação com os planos reais da conta Mercado Pago. Não cobra nada. */
  @Get('rules/simulation') @RequirePermissions(Permissions.SETTINGS_WRITE) simulate(@CurrentStore() storeId: string, @Query() { amount }: SimulationDto) { return this.rules.simulate(storeId, amount); }
}
