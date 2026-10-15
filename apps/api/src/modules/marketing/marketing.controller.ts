import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsEnum, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { SEGMENTS } from '../customers/segments';
import { Audience, AUDIENCES } from './campaign-rules';
import { MarketingCampaignsService } from './marketing-campaigns.service';

class CampaignDto {
  @IsString() @Length(2, 80) name!: string;
  @IsString() @MaxLength(150) subject!: string;
  @IsString() @MaxLength(8000) body!: string;
  @IsIn(AUDIENCES) audience!: Audience;
  @IsOptional() @IsIn(SEGMENTS) segment?: string | null;
}
class UpdateCampaignDto {
  @IsOptional() @IsString() @Length(2, 80) name?: string;
  @IsOptional() @IsString() @MaxLength(150) subject?: string;
  @IsOptional() @IsString() @MaxLength(8000) body?: string;
  @IsOptional() @IsIn(AUDIENCES) audience?: Audience;
  @IsOptional() @IsIn(SEGMENTS) segment?: string | null;
}
class TestDto { @IsEmail() email!: string; }
class PreviewQuery {
  @IsEnum(['ALL', 'NEWSLETTER', 'CUSTOMERS']) audience!: Audience;
  @IsOptional() @IsIn(SEGMENTS) segment?: string;
}

@ApiTags('Marketing') @Controller('marketing')
export class MarketingController {
  constructor(private readonly campaigns: MarketingCampaignsService) {}

  @Get('campaigns') @RequirePermissions(Permissions.MARKETING_WRITE) list(@CurrentStore() storeId: string) { return this.campaigns.list(storeId); }
  @Get('audience') @RequirePermissions(Permissions.MARKETING_WRITE) audience(@CurrentStore() storeId: string, @Query() q: PreviewQuery) { return this.campaigns.preview(storeId, q.audience, q.segment); }
  @Get('campaigns/:id') @RequirePermissions(Permissions.MARKETING_WRITE) get(@CurrentStore() storeId: string, @Param('id') id: string) { return this.campaigns.get(storeId, id); }
  @Post('campaigns') @RequirePermissions(Permissions.MARKETING_WRITE) create(@CurrentStore() storeId: string, @Body() dto: CampaignDto) { return this.campaigns.create(storeId, dto); }
  @Patch('campaigns/:id') @RequirePermissions(Permissions.MARKETING_WRITE) update(@CurrentStore() storeId: string, @Param('id') id: string, @Body() dto: UpdateCampaignDto) { return this.campaigns.update(storeId, id, dto); }
  @Delete('campaigns/:id') @HttpCode(204) @RequirePermissions(Permissions.MARKETING_WRITE) remove(@CurrentStore() storeId: string, @Param('id') id: string) { return this.campaigns.remove(storeId, id); }
  @Post('campaigns/:id/test') @HttpCode(200) @RequirePermissions(Permissions.MARKETING_WRITE) test(@CurrentStore() storeId: string, @Param('id') id: string, @Body() dto: TestDto) { return this.campaigns.sendTest(storeId, id, dto.email); }
  @Post('campaigns/:id/send') @HttpCode(200) @RequirePermissions(Permissions.MARKETING_WRITE) send(@CurrentStore() storeId: string, @Param('id') id: string) { return this.campaigns.start(storeId, id); }
  @Post('campaigns/:id/cancel') @HttpCode(200) @RequirePermissions(Permissions.MARKETING_WRITE) cancel(@CurrentStore() storeId: string, @Param('id') id: string) { return this.campaigns.cancel(storeId, id); }

  /** Públicos: o link do e-mail. O GET só mostra a confirmação; quem descadastra é o POST (robôs de e-mail abrem links sozinhos). */
  @Get('unsubscribe/:token') @Throttle({ default: { limit: 30, ttl: 60_000 } }) info(@Param('token') token: string) { return this.campaigns.unsubscribeInfo(token); }
  @Post('unsubscribe/:token') @HttpCode(200) @Throttle({ default: { limit: 30, ttl: 60_000 } }) unsubscribe(@Param('token') token: string) { return this.campaigns.unsubscribe(token); }
}
