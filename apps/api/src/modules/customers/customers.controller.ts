import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Header, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { CustomersService } from './customers.service';

class ListQuery { @IsOptional() @IsString() @MaxLength(100) q?: string; @IsOptional() @IsString() segment?: string; @IsOptional() @IsString() @MaxLength(30) tag?: string; @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number; }
class NoteDto { @IsString() @MaxLength(2000) body!: string; }
class UpdateDto {
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(30, { each: true }) tags?: string[];
  @IsOptional() @IsBoolean() marketingOptIn?: boolean;
}

@ApiTags('Customers') @Controller('customers') export class CustomersController {
  constructor(private readonly customers: CustomersService) {}
  @Get() @RequirePermissions(Permissions.ORDERS_READ) list(@CurrentStore() storeId: string, @Query() query: ListQuery) { return this.customers.list(storeId, query); }
  @Get('tags') @RequirePermissions(Permissions.ORDERS_READ) tags(@CurrentStore() storeId: string) { return this.customers.tags(storeId); }
  @Get('export.csv') @Header('Content-Type', 'text/csv; charset=utf-8') @Header('Content-Disposition', 'attachment; filename="clientes.csv"') @RequirePermissions(Permissions.ORDERS_READ) exportCsv(@CurrentStore() storeId: string, @Query() query: ListQuery) { return this.customers.exportCsv(storeId, query); }
  @Get(':id') @RequirePermissions(Permissions.ORDERS_READ) profile(@CurrentStore() storeId: string, @Param('id') id: string) { return this.customers.profile(storeId, id); }
  @Patch(':id') @RequirePermissions(Permissions.ORDERS_WRITE) update(@CurrentStore() storeId: string, @Param('id') id: string, @Body() dto: UpdateDto) { return this.customers.update(storeId, id, dto); }
  @Post(':id/notes') @RequirePermissions(Permissions.ORDERS_WRITE) addNote(@CurrentStore() storeId: string, @Param('id') id: string, @Req() req: { user: { sub: string } }, @Body() dto: NoteDto) { return this.customers.addNote(storeId, id, req.user.sub, dto.body); }
  @Delete(':id/notes/:noteId') @RequirePermissions(Permissions.ORDERS_WRITE) deleteNote(@CurrentStore() storeId: string, @Param('id') id: string, @Param('noteId') noteId: string) { return this.customers.deleteNote(storeId, id, noteId); }
  @Post(':id/anonymize') @HttpCode(200) @RequirePermissions(Permissions.ORDERS_WRITE) anonymize(@CurrentStore() storeId: string, @Param('id') id: string) { return this.customers.anonymize(storeId, id); }
}
