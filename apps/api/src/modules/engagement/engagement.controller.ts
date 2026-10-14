import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEmail, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { EngagementService } from './engagement.service';

const nullable = () => ValidateIf((_, v) => v !== null);

class CreateBannerDto {
  @IsString() @MaxLength(500) imageUrl!: string;
  @IsOptional() @nullable() @IsString() @MaxLength(500) mobileImageUrl?: string | null;
  @IsOptional() @nullable() @IsString() @MaxLength(80) title?: string | null;
  @IsOptional() @nullable() @IsString() @MaxLength(160) subtitle?: string | null;
  @IsOptional() @nullable() @IsString() @MaxLength(30) ctaLabel?: string | null;
  @IsOptional() @nullable() @IsString() @MaxLength(500) linkUrl?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(1000) position?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @nullable() @IsDateString() startsAt?: string | null;
  @IsOptional() @nullable() @IsDateString() endsAt?: string | null;
}
class BulkBannersDto { @IsArray() @ArrayMinSize(1) @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(500, { each: true }) images!: string[]; }
class UpdateBannerDto {
  @IsOptional() @IsString() @MaxLength(500) imageUrl?: string;
  @IsOptional() @nullable() @IsString() @MaxLength(500) mobileImageUrl?: string | null;
  @IsOptional() @nullable() @IsString() @MaxLength(80) title?: string | null;
  @IsOptional() @nullable() @IsString() @MaxLength(160) subtitle?: string | null;
  @IsOptional() @nullable() @IsString() @MaxLength(30) ctaLabel?: string | null;
  @IsOptional() @nullable() @IsString() @MaxLength(500) linkUrl?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(1000) position?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @nullable() @IsDateString() startsAt?: string | null;
  @IsOptional() @nullable() @IsDateString() endsAt?: string | null;
}
class WhatsappDto {
  @nullable() @IsString() @MaxLength(30) number!: string | null;
  @IsOptional() @nullable() @IsString() @MaxLength(200) message?: string | null;
}
class SubscribeDto {
  @IsString() storeSlug!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsOptional() @IsString() @Length(1, 80) name?: string;
}
class StoreQuery { @IsString() store!: string; }
class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
}

@ApiTags('Engagement') @Controller('engagement') export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  @Get('banners') banners(@Query() { store }: StoreQuery) { return this.engagement.publicBanners(store); }
  @Get('admin/banners') @RequirePermissions(Permissions.SETTINGS_WRITE) adminBanners(@CurrentStore() storeId: string) { return this.engagement.adminBanners(storeId); }
  @Post('admin/banners') @RequirePermissions(Permissions.SETTINGS_WRITE) createBanner(@CurrentStore() storeId: string, @Body() dto: CreateBannerDto) { return this.engagement.createBanner(storeId, dto); }
  @Post('admin/banners/bulk') @RequirePermissions(Permissions.SETTINGS_WRITE) createBanners(@CurrentStore() storeId: string, @Body() dto: BulkBannersDto) { return this.engagement.createBanners(storeId, dto.images); }
  @Patch('admin/banners/:id') @RequirePermissions(Permissions.SETTINGS_WRITE) updateBanner(@CurrentStore() storeId: string, @Param('id') id: string, @Body() dto: UpdateBannerDto) { return this.engagement.updateBanner(storeId, id, { ...dto }); }
  @Delete('admin/banners/:id') @HttpCode(204) @RequirePermissions(Permissions.SETTINGS_WRITE) deleteBanner(@CurrentStore() storeId: string, @Param('id') id: string) { return this.engagement.deleteBanner(storeId, id); }

  @Get('admin/whatsapp') @RequirePermissions(Permissions.SETTINGS_WRITE) whatsapp(@CurrentStore() storeId: string) { return this.engagement.whatsapp(storeId); }
  @Put('admin/whatsapp') @RequirePermissions(Permissions.SETTINGS_WRITE) saveWhatsapp(@CurrentStore() storeId: string, @Body() dto: WhatsappDto) { return this.engagement.saveWhatsapp(storeId, dto.number, dto.message ?? null); }

  @Post('newsletter') @HttpCode(200) @Throttle({ default: { limit: 5, ttl: 60_000 } }) subscribe(@Body() dto: SubscribeDto) { return this.engagement.subscribe(dto.storeSlug, dto.email, dto.name); }
  @Get('admin/newsletter') @RequirePermissions(Permissions.MARKETING_WRITE) subscribers(@CurrentStore() storeId: string, @Query() query: PageQuery) { return this.engagement.subscribers(storeId, query); }
  @Get('admin/newsletter/export.csv') @Header('Content-Type', 'text/csv; charset=utf-8') @Header('Content-Disposition', 'attachment; filename="newsletter.csv"') @RequirePermissions(Permissions.MARKETING_WRITE) exportSubscribers(@CurrentStore() storeId: string) { return this.engagement.exportSubscribers(storeId); }
  @Delete('admin/newsletter/:id') @HttpCode(204) @RequirePermissions(Permissions.MARKETING_WRITE) unsubscribe(@CurrentStore() storeId: string, @Param('id') id: string) { return this.engagement.unsubscribe(storeId, id); }
}
