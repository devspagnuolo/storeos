import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { ProductImportService } from './product-import.service';
@Module({ controllers: [CatalogController], providers: [CatalogService, ProductImportService], exports: [CatalogService, ProductImportService] }) export class CatalogModule {}
