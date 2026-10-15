import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { AnalyticsService } from './analytics.service';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
class RangeQuery { @IsOptional() @Matches(DATE) from?: string; @IsOptional() @Matches(DATE) to?: string; }

@ApiTags('Analytics') @Controller('analytics') export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}
  @Get('orders.csv') @Header('Content-Type', 'text/csv; charset=utf-8') @Header('Content-Disposition', 'attachment; filename="pedidos.csv"') @RequirePermissions(Permissions.ORDERS_READ) ordersCsv(@CurrentStore() storeId: string, @Query() { from, to }: RangeQuery) { return this.analytics.ordersCsv(storeId, from, to); }
  @Get('sales') @RequirePermissions(Permissions.ORDERS_READ) sales(@CurrentStore() storeId: string, @Query() { from, to }: RangeQuery) { return this.analytics.sales(storeId, from, to); }
}
