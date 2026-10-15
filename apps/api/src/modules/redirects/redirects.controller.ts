import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { RedirectsService } from './redirects.service';

class CreateDto { @IsString() @Length(1, 300) from!: string; @IsString() @Length(1, 500) to!: string; }
class UpdateDto { @IsString() @Length(1, 500) to!: string; }
class ResolveQuery { @IsOptional() @IsString() @MaxLength(80) store?: string; @IsOptional() @IsString() @MaxLength(255) host?: string; @IsString() @MaxLength(600) path!: string; }

@ApiTags('Redirects') @Controller('redirects')
export class RedirectsController {
  constructor(private readonly redirects: RedirectsService) {}
  @Get('resolve') @SkipThrottle() resolve(@Query() query: ResolveQuery) { return this.redirects.resolve(query); }
  @Get() @RequirePermissions(Permissions.CATALOG_WRITE) list(@CurrentStore() storeId: string, @Query('q') q?: string) { return this.redirects.list(storeId, q); }
  @Post() @RequirePermissions(Permissions.CATALOG_WRITE) create(@CurrentStore() storeId: string, @Body() dto: CreateDto) { return this.redirects.create(storeId, dto.from, dto.to); }
  @Post('import') @HttpCode(200) @RequirePermissions(Permissions.CATALOG_WRITE) importCsv(@CurrentStore() storeId: string, @Body() csv: string) { return this.redirects.importCsv(storeId, typeof csv === 'string' ? csv : ''); }
  @Post('nuvemshop') @HttpCode(200) @RequirePermissions(Permissions.CATALOG_WRITE) nuvemshop(@CurrentStore() storeId: string) { return this.redirects.generateNuvemshop(storeId); }
  @Patch(':id') @RequirePermissions(Permissions.CATALOG_WRITE) update(@CurrentStore() storeId: string, @Param('id') id: string, @Body() dto: UpdateDto) { return this.redirects.update(storeId, id, dto.to); }
  @Delete(':id') @HttpCode(204) @RequirePermissions(Permissions.CATALOG_WRITE) remove(@CurrentStore() storeId: string, @Param('id') id: string) { return this.redirects.remove(storeId, id); }
}
