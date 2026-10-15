import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProductStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUrl, Length, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { Throttle } from '@nestjs/throttler';
import { CatalogService } from './catalog.service';
import { ProductImportService } from './product-import.service';
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
  @IsOptional() @IsUrl({ protocols: ['https', 'http'], require_protocol: true, require_tld: false }) imageUrl?: string;
  /** Galeria completa, na ordem; substitui as fotos atuais. */
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUrl({ protocols: ['https', 'http'], require_protocol: true, require_tld: false }, { each: true }) imageUrls?: string[];
  @IsOptional() @IsString() brandId?: string;
  @IsOptional() @IsString() @MaxLength(70) seoTitle?: string;
  @IsOptional() @IsString() @MaxLength(160) seoDescription?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100_000) weightGrams?: number;
  @IsOptional() @IsInt() @Min(1) @Max(300) widthCm?: number;
  @IsOptional() @IsInt() @Min(1) @Max(300) heightCm?: number;
  @IsOptional() @IsInt() @Min(1) @Max(300) lengthCm?: number;
  @IsOptional() @Matches(/^\d{4}\.?\d{2}\.?\d{2}$/, { message: 'NCM deve ter 8 dígitos' }) ncm?: string;
  @IsOptional() @Matches(/^\d{2}\.?\d{3}\.?\d{2}$/, { message: 'CEST deve ter 7 dígitos' }) cest?: string;
  @IsOptional() @Matches(/^\d{8}$|^\d{12,14}$/, { message: 'GTIN/EAN deve ter 8, 12, 13 ou 14 dígitos' }) gtin?: string;
  @IsOptional() @IsInt() @Min(0) @Max(8) taxOrigin?: number;
  @IsOptional() @IsString() @MaxLength(6) unit?: string;
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
  @IsOptional() @ValidateIf((_, v) => v !== '') @IsUrl({ protocols: ['https', 'http'], require_protocol: true, require_tld: false }) imageUrl?: string;
  /** Galeria completa, na ordem; substitui as fotos atuais. */
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUrl({ protocols: ['https', 'http'], require_protocol: true, require_tld: false }, { each: true }) imageUrls?: string[];
  /** null remove a marca. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() brandId?: string | null;
  @IsOptional() @IsString() @MaxLength(70) seoTitle?: string;
  @IsOptional() @IsString() @MaxLength(160) seoDescription?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(100_000) weightGrams?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(300) widthCm?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(300) heightCm?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(300) lengthCm?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(/^\d{4}\.?\d{2}\.?\d{2}$/, { message: 'NCM deve ter 8 dígitos' }) ncm?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(/^\d{2}\.?\d{3}\.?\d{2}$/, { message: 'CEST deve ter 7 dígitos' }) cest?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(/^\d{8}$|^\d{12,14}$/, { message: 'GTIN/EAN deve ter 8, 12, 13 ou 14 dígitos' }) gtin?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(8) taxOrigin?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(6) unit?: string | null;
}
class CreateCategoryDto { @IsString() name!: string; @Matches(SLUG) slug!: string; @IsOptional() @IsString() description?: string; @IsOptional() @IsInt() position?: number; @IsOptional() @IsString() parentId?: string | null; @IsOptional() @IsString() @MaxLength(500) bannerUrl?: string; @IsOptional() @IsString() @MaxLength(500) bannerMobileUrl?: string; }
class UpdateCategoryDto { @IsOptional() @IsString() @Length(2, 80) name?: string; @IsOptional() @Matches(SLUG) slug?: string; @IsOptional() @IsString() description?: string; @IsOptional() @IsInt() position?: number; @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() parentId?: string | null; @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500) bannerUrl?: string | null; @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500) bannerMobileUrl?: string | null; }
class VariantAttributeDto { @IsString() @Length(1, 40) name!: string; @IsString() @Length(1, 60) value!: string; }
class VariantDto {
  @IsOptional() @IsString() id?: string;
  @IsString() @Length(1, 64) sku!: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(/^\d{8}$|^\d{12,14}$/, { message: 'GTIN/EAN deve ter 8, 12, 13 ou 14 dígitos' }) gtin?: string | null;
  @IsArray() @ArrayMaxSize(3) @ValidateNested({ each: true }) @Type(() => VariantAttributeDto) attributes!: VariantAttributeDto[];
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) price?: number | null;
  @IsInt() @Min(0) @Max(1_000_000) stock!: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
class ReplaceVariantsDto { @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => VariantDto) variants!: VariantDto[]; }
class CreateBrandDto { @IsString() @Length(2, 80) name!: string; @Matches(SLUG) @MaxLength(80) slug!: string; @IsOptional() @IsUrl({ protocols: ['https', 'http'], require_protocol: true }) logoUrl?: string; }
class CreateCollectionDto { @IsString() @Length(2, 80) name!: string; @Matches(SLUG) @MaxLength(80) slug!: string; @IsOptional() @IsString() @MaxLength(500) description?: string; @IsOptional() @IsBoolean() active?: boolean; @IsOptional() @IsInt() position?: number; @IsOptional() @IsArray() @ArrayMaxSize(2000) @IsString({ each: true }) skus?: string[]; }
class UpdateCollectionDto { @IsOptional() @IsString() @Length(2, 80) name?: string; @IsOptional() @Matches(SLUG) @MaxLength(80) slug?: string; @IsOptional() @IsString() @MaxLength(500) description?: string; @IsOptional() @IsBoolean() active?: boolean; @IsOptional() @IsInt() position?: number; @IsOptional() @IsArray() @ArrayMaxSize(2000) @IsString({ each: true }) skus?: string[]; }
class ProductQueryDto { @IsString() store!: string; @IsOptional() @IsString() @MaxLength(1000) ids?: string; @IsOptional() @IsString() category?: string; @IsOptional() @IsString() brand?: string; @IsOptional() @IsString() collection?: string; @IsOptional() @IsString() @MaxLength(100) q?: string; @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(60) pageSize?: number; }
class AdminProductQueryDto { @IsOptional() @IsString() @MaxLength(1000) ids?: string; @IsOptional() @IsString() @MaxLength(100) q?: string; @IsOptional() @IsString() @MaxLength(160) category?: string; @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus; @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number; }
class ImportQueryDto { @IsOptional() @IsIn(['true', 'false']) dryRun?: string; }
class StoreQueryDto { @IsString() store!: string; }
class AvailabilityItemDto { @IsString() @MaxLength(64) productId!: string; @IsOptional() @IsString() @MaxLength(64) variantId?: string; }
class AvailabilityDto { @IsString() store!: string; @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => AvailabilityItemDto) items!: AvailabilityItemDto[]; }
@ApiTags('Catalog') @Controller('catalog') export class CatalogController {
  constructor(private readonly catalog: CatalogService, private readonly imports: ProductImportService) {}
  @Get('products') list(@Query() { store, ...query }: ProductQueryDto) { return this.catalog.listPublic(store, query); }
  @Post('products/import') @HttpCode(200) @RequirePermissions(Permissions.CATALOG_WRITE) importProducts(@CurrentStore() storeId: string, @Body() csv: string, @Query() { dryRun }: ImportQueryDto) { return this.imports.importCsv(storeId, csv, dryRun === 'true'); }
  @Get('admin/export.csv') @Header('Content-Type', 'text/csv; charset=utf-8') @Header('Content-Disposition', 'attachment; filename="produtos.csv"') @RequirePermissions(Permissions.CATALOG_WRITE) exportProducts(@CurrentStore() storeId: string) { return this.imports.exportCsv(storeId); }
  /** Saldo e preço atuais das linhas do carrinho, sem cache: o carrinho e o checkout usam para não passar do estoque. */
  @Post('availability') @HttpCode(200) @Throttle({ default: { limit: 60, ttl: 60_000 } }) availability(@Body() { store, items }: AvailabilityDto) { return this.catalog.availability(store, items); }
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
  @Put('products/:id/variants') @RequirePermissions(Permissions.CATALOG_WRITE) replaceVariants(@CurrentStore() storeId: string, @Param('id') id: string, @Body() dto: ReplaceVariantsDto) { return this.catalog.replaceVariants(storeId, id, dto.variants); }
  @Post('categories') @RequirePermissions(Permissions.CATALOG_WRITE) createCategory(@CurrentStore() storeId: string, @Body() dto: CreateCategoryDto) { return this.catalog.createCategory(storeId, dto); }
  @Patch('categories/:id') @RequirePermissions(Permissions.CATALOG_WRITE) updateCategory(@CurrentStore() storeId: string, @Param('id') id: string, @Body() dto: UpdateCategoryDto) { return this.catalog.updateCategory(storeId, id, dto); }
  @Delete('categories/:id') @HttpCode(204) @RequirePermissions(Permissions.CATALOG_WRITE) deleteCategory(@CurrentStore() storeId: string, @Param('id') id: string) { return this.catalog.deleteCategory(storeId, id); }
}
