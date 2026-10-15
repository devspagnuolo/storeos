import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { SeoService } from './seo.service';

class MarketingConfigDto {
  @IsOptional() @IsString() @MaxLength(40) ga4?: string;
  @IsOptional() @IsString() @MaxLength(40) gtm?: string;
  @IsOptional() @IsString() @MaxLength(40) metaPixel?: string;
  @IsOptional() @IsString() @MaxLength(120) googleVerification?: string;
  @IsOptional() @IsString() @MaxLength(100) homeTitle?: string;
  @IsOptional() @IsString() @MaxLength(300) homeDescription?: string;
}

@ApiTags('SEO') @Controller('seo')
export class SeoController {
  constructor(private readonly seo: SeoService) {}
  @Get('tracking') @RequirePermissions(Permissions.SETTINGS_WRITE) tracking(@CurrentStore() storeId: string) { return this.seo.getConfig(storeId); }
  @Put('tracking') @RequirePermissions(Permissions.SETTINGS_WRITE) save(@CurrentStore() storeId: string, @Body() dto: MarketingConfigDto) { return this.seo.saveConfig(storeId, { ...dto }); }
  @Get('audit') @RequirePermissions(Permissions.CATALOG_WRITE) audit(@CurrentStore() storeId: string) { return this.seo.audit(storeId); }
}
