import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ReviewStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { ReviewsService } from './reviews.service';

class SubmitDto {
  @IsString() @MaxLength(80) storeSlug!: string;
  @IsString() @MaxLength(160) productSlug!: string;
  @IsString() @Length(1, 40) orderNumber!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsString() @MaxLength(4000) body!: string;
}
class PublicQuery { @IsString() store!: string; @IsString() product!: string; @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number; }
class ListQuery { @IsOptional() @IsEnum(ReviewStatus) status?: ReviewStatus; @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number; }
class ModerateDto { @IsOptional() @IsEnum(ReviewStatus) status?: ReviewStatus; @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(1000) reply?: string | null; }

@ApiTags('Reviews') @Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}
  @Get('public') publicList(@Query() { store, product, page }: PublicQuery) { return this.reviews.publicList(store, product, page); }
  @Post() @Throttle({ default: { limit: 10, ttl: 60_000 } }) submit(@Body() dto: SubmitDto) { return this.reviews.submit(dto); }
  @Get() @RequirePermissions(Permissions.CATALOG_WRITE) list(@CurrentStore() storeId: string, @Query() { status, page }: ListQuery) { return this.reviews.list(storeId, { status, page }); }
  @Patch(':id') @RequirePermissions(Permissions.CATALOG_WRITE) moderate(@CurrentStore() storeId: string, @Param('id') id: string, @Body() dto: ModerateDto) { return this.reviews.moderate(storeId, id, dto); }
  @Delete(':id') @HttpCode(204) @RequirePermissions(Permissions.CATALOG_WRITE) remove(@CurrentStore() storeId: string, @Param('id') id: string) { return this.reviews.remove(storeId, id); }
}
