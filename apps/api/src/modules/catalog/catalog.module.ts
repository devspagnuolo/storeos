import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductAdminService } from './application/product-admin.service';
import { ProductImportService } from './application/product-import.service';
import { SlugService } from './application/slug.service';
import { StorefrontCatalogService } from './application/storefront-catalog.service';
import { TaxonomyService } from './application/taxonomy.service';
import { CatalogAdminController } from './presentation/catalog-admin.controller';
import { StorefrontCatalogController } from './presentation/storefront-catalog.controller';

@Module({
  imports: [InventoryModule],
  controllers: [CatalogAdminController, StorefrontCatalogController],
  providers: [SlugService, ProductAdminService, ProductImportService, TaxonomyService, StorefrontCatalogService],
  exports: [StorefrontCatalogService, ProductAdminService, TaxonomyService],
})
export class CatalogModule {}
