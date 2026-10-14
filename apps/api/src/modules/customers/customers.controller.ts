import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { CustomersService } from './customers.service';

class ListQuery { @IsOptional() @IsString() @MaxLength(100) q?: string; @IsOptional() @IsString() segment?: string; @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number; }
class UpdateDto {
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(30, { each: true }) tags?: string[];
  @IsOptional() @IsBoolean() marketingOptIn?: boolean;
}

@ApiTags('Customers') @Controller('customers') export class CustomersController {
  constructor(private readonly customers: CustomersService) {}
  @Get() @RequirePermissions(Permissions.ORDERS_READ) list(@CurrentStore() storeId: string, @Query() query: ListQuery) { return this.customers.list(storeId, query); }
  @Get(':id') @RequirePermissions(Permissions.ORDERS_READ) profile(@CurrentStore() storeId: string, @Param('id') id: string) { return this.customers.profile(storeId, id); }
  @Patch(':id') @RequirePermissions(Permissions.ORDERS_WRITE) update(@CurrentStore() storeId: string, @Param('id') id: string, @Body() dto: UpdateDto) { return this.customers.update(storeId, id, dto); }
  @Post(':id/anonymize') @HttpCode(200) @RequirePermissions(Permissions.ORDERS_WRITE) anonymize(@CurrentStore() storeId: string, @Param('id') id: string) { return this.customers.anonymize(storeId, id); }
}
