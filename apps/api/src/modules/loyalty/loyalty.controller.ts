import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNumber, IsString, Length, Max, Min } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { LoyaltyService } from './loyalty.service';

class AdjustDto { @IsInt() @Min(-1_000_000) @Max(1_000_000) points!: number; @IsString() @Length(3, 200) note!: string; }
class RedeemDto { @IsInt() @Min(1) @Max(1_000_000) points!: number; }
class ConfigDto {
  @IsBoolean() enabled!: boolean;
  @IsNumber({ maxDecimalPlaces: 2 }) pointsPerReal!: number;
  @IsNumber({ maxDecimalPlaces: 4 }) realPerPoint!: number;
  @IsInt() @Min(1) @Max(1_000_000) minRedeem!: number;
  @IsInt() @Min(1) @Max(10_000_000) silverFrom!: number;
  @IsInt() @Min(1) @Max(10_000_000) goldFrom!: number;
  @IsInt() @Min(1) @Max(10_000_000) diamondFrom!: number;
  @IsInt() @Min(100) @Max(500) silverPct!: number;
  @IsInt() @Min(100) @Max(500) goldPct!: number;
  @IsInt() @Min(100) @Max(500) diamondPct!: number;
}
type AuthedRequest = { user: { sub: string } };

@ApiTags('Loyalty') @Controller('loyalty') export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}
  @Get('config') @RequirePermissions(Permissions.MARKETING_WRITE) config(@CurrentStore() storeId: string) { return this.loyalty.config(storeId); }
  @Put('config') @RequirePermissions(Permissions.MARKETING_WRITE) saveConfig(@CurrentStore() storeId: string, @Body() dto: ConfigDto) { return this.loyalty.saveConfig(storeId, dto); }
  @Delete('config') @RequirePermissions(Permissions.MARKETING_WRITE) resetConfig(@CurrentStore() storeId: string) { return this.loyalty.resetConfig(storeId); }
  @Get('customers/:id') @RequirePermissions(Permissions.ORDERS_READ) summary(@CurrentStore() storeId: string, @Param('id') id: string) { return this.loyalty.summary(storeId, id); }
  @Post('customers/:id/adjust') @HttpCode(200) @RequirePermissions(Permissions.MARKETING_WRITE) adjust(@CurrentStore() storeId: string, @Param('id') id: string, @Body() dto: AdjustDto, @Req() req: AuthedRequest) { return this.loyalty.adjust(storeId, id, dto.points, dto.note, req.user.sub); }
  @Post('customers/:id/redeem') @HttpCode(200) @RequirePermissions(Permissions.MARKETING_WRITE) redeem(@CurrentStore() storeId: string, @Param('id') id: string, @Body() dto: RedeemDto, @Req() req: AuthedRequest) { return this.loyalty.redeem(storeId, id, dto.points, req.user.sub); }
}
