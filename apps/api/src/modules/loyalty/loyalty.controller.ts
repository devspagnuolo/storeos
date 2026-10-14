import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsInt, IsString, Length, Max, Min } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { LoyaltyService } from './loyalty.service';

class AdjustDto { @IsInt() @Min(-1_000_000) @Max(1_000_000) points!: number; @IsString() @Length(3, 200) note!: string; }
class RedeemDto { @IsInt() @Min(1) @Max(1_000_000) points!: number; }
type AuthedRequest = { user: { sub: string } };

@ApiTags('Loyalty') @Controller('loyalty') export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}
  @Get('customers/:id') @RequirePermissions(Permissions.ORDERS_READ) summary(@CurrentStore() storeId: string, @Param('id') id: string) { return this.loyalty.summary(storeId, id); }
  @Post('customers/:id/adjust') @HttpCode(200) @RequirePermissions(Permissions.MARKETING_WRITE) adjust(@CurrentStore() storeId: string, @Param('id') id: string, @Body() dto: AdjustDto, @Req() req: AuthedRequest) { return this.loyalty.adjust(storeId, id, dto.points, dto.note, req.user.sub); }
  @Post('customers/:id/redeem') @HttpCode(200) @RequirePermissions(Permissions.MARKETING_WRITE) redeem(@CurrentStore() storeId: string, @Param('id') id: string, @Body() dto: RedeemDto, @Req() req: AuthedRequest) { return this.loyalty.redeem(storeId, id, dto.points, req.user.sub); }
}
