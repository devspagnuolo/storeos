import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { CatalogService } from './catalog.service';
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
class CreateProductDto { @IsString() name!: string; @Matches(SLUG) slug!: string; @IsString() sku!: string; @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price!: number; @IsOptional() @IsString() description?: string; @IsOptional() @IsArray() @IsString({ each: true }) categoryIds?: string[]; }
class CreateCategoryDto { @IsString() name!: string; @Matches(SLUG) slug!: string; @IsOptional() @IsString() description?: string; @IsOptional() @IsInt() position?: number; }
class ProductQueryDto { @IsString() store!: string; @IsOptional() @IsString() category?: string; @IsOptional() @IsString() @MaxLength(100) q?: string; @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(60) pageSize?: number; }
class StoreQueryDto { @IsString() store!: string; }
@ApiTags('Catalog') @Controller('catalog') export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}
  @Get('products') list(@Query() { store, ...query }: ProductQueryDto) { return this.catalog.listPublic(store, query); }
  @Get('products/:slug') product(@Query() { store }: StoreQueryDto, @Param('slug') slug: string) { return this.catalog.bySlug(store, slug); }
  @Get('categories') categories(@Query() { store }: StoreQueryDto) { return this.catalog.categories(store); }
  @Post('products') @RequirePermissions(Permissions.CATALOG_WRITE) create(@CurrentStore() storeId: string, @Body() dto: CreateProductDto) { return this.catalog.create(storeId, dto); }
  @Post('categories') @RequirePermissions(Permissions.CATALOG_WRITE) createCategory(@CurrentStore() storeId: string, @Body() dto: CreateCategoryDto) { return this.catalog.createCategory(storeId, dto); }
}
