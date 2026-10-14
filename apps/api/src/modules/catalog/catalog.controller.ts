import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProductStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUrl, Length, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { CatalogService } from './catalog.service';
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
class CreateProductDto {
  @IsString() @Length(2, 160) name!: string;
  @Matches(SLUG) @MaxLength(160) slug!: string;
  @IsString() @Length(1, 60) sku!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price!: number;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) categoryIds?: string[];
  @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus;
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000) stock?: number;
  @IsOptional() @IsUrl({ protocols: ['https', 'http'], require_protocol: true }) imageUrl?: string;
  @IsOptional() @IsString() brandId?: string;
  @IsOptional() @IsString() @MaxLength(70) seoTitle?: string;
  @IsOptional() @IsString() @MaxLength(160) seoDescription?: string;
}
class UpdateProductDto {
  @IsOptional() @IsString() @Length(2, 160) name?: string;
  @IsOptional() @Matches(SLUG) @MaxLength(160) slug?: string;
  @IsOptional() @IsString() @Length(1, 60) sku?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price?: number;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) categoryIds?: string[];
  @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus;
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000) stock?: number;
  /** String vazia remove a imagem principal. */
  @IsOptional() @ValidateIf((_, v) => v !== '') @IsUrl({ protocols: ['https', 'http'], require_protocol: true }) imageUrl?: string;
  /** null remove a marca. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() brandId?: string | null;
  @IsOptional() @IsString() @MaxLength(70) seoTitle?: string;
  @IsOptional() @IsString() @MaxLength(160) seoDescription?: string;
}
class CreateCategoryDto { @IsString() name!: string; @Matches(SLUG) slug!: string; @IsOptional() @IsString() description?: string; @IsOptional() @IsInt() position?: number; }
class CreateBrandDto { @IsString() @Length(2, 80) name!: string; @Matches(SLUG) @MaxLength(80) slug!: string; @IsOptional() @IsUrl({ protocols: ['https', 'http'], require_protocol: true }) logoUrl?: string; }
class CreateCollectionDto { @IsString() @Length(2, 80) name!: string; @Matches(SLUG) @MaxLength(80) slug!: string; @IsOptional() @IsString() @MaxLength(500) description?: string; @IsOptional() @IsBoolean() active?: boolean; @IsOptional() @IsInt() position?: number; @IsOptional() @IsArray() @ArrayMaxSize(2000) @IsString({ each: true }) skus?: string[]; }
class UpdateCollectionDto { @IsOptional() @IsString() @Length(2, 80) name?: string; @IsOptional() @Matches(SLUG) @MaxLength(80) slug?: string; @IsOptional() @IsString() @MaxLength(500) description?: string; @IsOptional() @IsBoolean() active?: boolean; @IsOptional() @IsInt() position?: number; @IsOptional() @IsArray() @ArrayMaxSize(2000) @IsString({ each: true }) skus?: string[]; }
class ProductQueryDto { @IsString() store!: string; @IsOptional() @IsString() category?: string; @IsOptional() @IsString() brand?: string; @IsOptional() @IsString() collection?: string; @IsOptional() @IsString() @MaxLength(100) q?: string; @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(60) pageSize?: number; }
class AdminProductQueryDto { @IsOptional() @IsString() @MaxLength(100) q?: string; @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus; @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number; }
class StoreQueryDto { @IsString() store!: string; }
@ApiTags('Catalog') @Controller('catalog') export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}
  @Get('products') list(@Query() { store, ...query }: ProductQueryDto) { return this.catalog.listPublic(store, query); }
  @Get('products/:slug') product(@Query() { store }: StoreQueryDto, @Param('slug') slug: string) { return this.catalog.bySlug(store, slug); }
  @Get('brands') brands(@Query() { store }: StoreQueryDto) { return this.catalog.brands(store); }
  @Get('collections') collections(@Query() { store }: StoreQueryDto) { return this.catalog.collections(store); }
  @Get('admin/collections') @RequirePermissions(Permissions.CATALOG_WRITE) adminCollections(@CurrentStore() storeId: string) { return this.catalog.adminCollections(storeId); }
  @Post('brands') @RequirePermissions(Permissions.CATALOG_WRITE) createBrand(@CurrentStore() storeId: string, @Body() dto: CreateBrandDto) { return this.catalog.createBrand(storeId, dto); }
  @Post('collections') @RequirePermissions(Permissions.CATALOG_WRITE) createCollection(@CurrentStore() storeId: string, @Body() dto: CreateCollectionDto) { return this.catalog.createCollection(storeId, dto); }
  @Patch('collections/:id') @RequirePermissions(Permissions.CATALOG_WRITE) updateCollection(@CurrentStore() storeId: string, @Param('id') id: string, @Body() dto: UpdateCollectionDto) { return this.catalog.updateCollection(storeId, id, dto); }
  @Get('categories') categories(@Query() { store }: StoreQueryDto) { return this.catalog.categories(store); }
  @Get('admin/products') @RequirePermissions(Permissions.CATALOG_WRITE) adminList(@CurrentStore() storeId: string, @Query() query: AdminProductQueryDto) { return this.catalog.adminList(storeId, query); }
  @Get('admin/products/:id') @RequirePermissions(Permissions.CATALOG_WRITE) adminGet(@CurrentStore() storeId: string, @Param('id') id: string) { return this.catalog.adminGet(storeId, id); }
  @Post('products') @RequirePermissions(Permissions.CATALOG_WRITE) create(@CurrentStore() storeId: string, @Body() dto: CreateProductDto) { return this.catalog.create(storeId, dto); }
  @Patch('products/:id') @RequirePermissions(Permissions.CATALOG_WRITE) update(@CurrentStore() storeId: string, @Param('id') id: string, @Body() dto: UpdateProductDto) { return this.catalog.update(storeId, id, dto); }
  @Post('categories') @RequirePermissions(Permissions.CATALOG_WRITE) createCategory(@CurrentStore() storeId: string, @Body() dto: CreateCategoryDto) { return this.catalog.createCategory(storeId, dto); }
}
