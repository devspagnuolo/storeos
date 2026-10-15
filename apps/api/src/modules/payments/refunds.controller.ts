import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RefundMode } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { RefundsService } from './refunds.service';

class RefundDto {
  @IsOptional() amount?: unknown;
  @IsString() @MinLength(3) @MaxLength(280) reason!: string;
  @IsEnum(RefundMode) mode!: RefundMode;
}

@ApiTags('Reembolsos')
@Controller('orders/:number/refunds')
export class RefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Get() @RequirePermissions(Permissions.ORDERS_READ) @ApiOperation({ summary: 'Reembolsos do pedido e quanto ainda pode ser devolvido' })
  list(@CurrentStore() storeId: string, @Param('number') number: string) { return this.refunds.list(storeId, number); }

  @Post() @HttpCode(200) @RequirePermissions(Permissions.ORDERS_WRITE) @ApiOperation({ summary: 'Reembolsa (total ou parcial) pelo Mercado Pago ou registra um reembolso feito fora do sistema' })
  create(@CurrentStore() storeId: string, @Param('number') number: string, @Body() dto: RefundDto, @Req() req: { user: { sub: string } }) { return this.refunds.create(storeId, number, dto, req.user.sub); }
}
