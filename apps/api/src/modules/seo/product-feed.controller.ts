import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { CurrentStore } from '../../shared/auth/current-store.decorator';
import { Permissions, RequirePermissions } from '../../shared/auth/permissions';
import { ProductFeedService } from './product-feed.service';

class StoreQueryDto { @IsString() store!: string; }

@ApiTags('Feeds') @Controller('feeds')
export class ProductFeedController {
  constructor(private readonly feed: ProductFeedService) {}
  @Get('google.xml') @Header('Content-Type', 'application/xml; charset=utf-8') @Header('Cache-Control', 'public, max-age=300') google(@Query() { store }: StoreQueryDto) { return this.feed.googleXml(store); }
  @Get('meta.csv') @Header('Content-Type', 'text/csv; charset=utf-8') @Header('Cache-Control', 'public, max-age=300') meta(@Query() { store }: StoreQueryDto) { return this.feed.metaCsv(store); }
  @Get('status') @RequirePermissions(Permissions.CATALOG_WRITE) status(@CurrentStore() storeId: string) { return this.feed.status(storeId); }
}
