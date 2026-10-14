import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { IsArray, ArrayMaxSize } from 'class-validator';
import { ContentService } from './content.service';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
class StoreQuery { @IsString() store!: string; }
class CreatePageDto {
  @Matches(SLUG) @MaxLength(80) slug!: string;
  @IsString() @Length(2, 120) title!: string;
  @IsString() @Length(1, 20_000) body!: string;
  @IsOptional() @IsBoolean() published?: boolean;
  @IsOptional() @IsBoolean() showInFooter?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1000) position?: number;
  @IsOptional() @IsString() @MaxLength(160) seoDescription?: string;
}
class UpdatePageDto {
  @IsOptional() @Matches(SLUG) @MaxLength(80) slug?: string;
  @IsOptional() @IsString() @Length(2, 120) title?: string;
  @IsOptional() @IsString() @Length(1, 20_000) body?: string;
  @IsOptional() @IsBoolean() published?: boolean;
  @IsOptional() @IsBoolean() showInFooter?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1000) position?: number;
  @IsOptional() @IsString() @MaxLength(160) seoDescription?: string;
}

class SaveMenuDto { @IsArray() @ArrayMaxSize(30) items!: unknown[]; }

@ApiTags('Content') @Controller('content') export class ContentController {
  constructor(private readonly content: ContentService) {}
  @Get('pages') list(@Query() { store }: StoreQuery) { return this.content.listPublished(store); }
  @Get('pages/:slug') page(@Query() { store }: StoreQuery, @Param('slug') slug: string) { return this.content.bySlug(store, slug); }
  @Get('admin/pages') @RequirePermissions(Permissions.SETTINGS_WRITE) adminList(@CurrentStore() storeId: string) { return this.content.adminList(storeId); }
  @Post('admin/pages') @RequirePermissions(Permissions.SETTINGS_WRITE) create(@CurrentStore() storeId: string, @Body() dto: CreatePageDto) { return this.content.create(storeId, dto); }
  @Patch('admin/pages/:id') @RequirePermissions(Permissions.SETTINGS_WRITE) update(@CurrentStore() storeId: string, @Param('id') id: string, @Body() dto: UpdatePageDto) { return this.content.update(storeId, id, dto); }
  @Delete('admin/pages/:id') @HttpCode(204) @RequirePermissions(Permissions.SETTINGS_WRITE) remove(@CurrentStore() storeId: string, @Param('id') id: string) { return this.content.remove(storeId, id); }
  @Get('menus/:key') menu(@Query() { store }: StoreQuery, @Param('key') key: string) { return this.content.publicMenu(store, key); }
  @Get('admin/menus/:key') @RequirePermissions(Permissions.SETTINGS_WRITE) adminMenu(@CurrentStore() storeId: string, @Param('key') key: string) { return this.content.adminMenu(storeId, key); }
  @Put('admin/menus/:key') @RequirePermissions(Permissions.SETTINGS_WRITE) saveMenu(@CurrentStore() storeId: string, @Param('key') key: string, @Body() dto: SaveMenuDto) { return this.content.saveMenu(storeId, key, dto.items); }
  @Delete('admin/menus/:key') @HttpCode(204) @RequirePermissions(Permissions.SETTINGS_WRITE) resetMenu(@CurrentStore() storeId: string, @Param('key') key: string) { return this.content.resetMenu(storeId, key); }
}
