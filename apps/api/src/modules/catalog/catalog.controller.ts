import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { CatalogService } from './catalog.service';
class CreateProductDto { @IsString() name!: string; @IsString() slug!: string; @IsString() sku!: string; @IsNumber() @Min(0) price!: number; @IsOptional() @IsString() description?: string; }
@ApiTags('Catalog') @Controller('catalog') export class CatalogController { constructor(private readonly catalog: CatalogService) {} @Get('products') list(@Query('store') slug: string) { return this.catalog.listPublic(slug); } @Get('products/:slug') product(@Query('store') store: string, @Param('slug') slug: string) { return this.catalog.bySlug(store, slug); } @Post('products') @UseGuards(JwtAuthGuard) @ApiBearerAuth() create(@CurrentStore() storeId: string, @Body() dto: CreateProductDto) { return this.catalog.create(storeId, dto); } }
