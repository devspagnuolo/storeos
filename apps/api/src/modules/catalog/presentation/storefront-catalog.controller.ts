import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { productListQuery } from '@storeos/contracts';
import { z } from 'zod';
import { Public, PublicStore } from '../../../shared/presentation/decorators/auth.decorators';
import { ZodQuery } from '../../../shared/presentation/pipes/zod';
import type { StoreContext } from '../../../shared/presentation/request.types';
import { StorefrontCatalogService } from '../application/storefront-catalog.service';
import { TaxonomyService } from '../application/taxonomy.service';

@ApiTags('Storefront · Catálogo')
@ApiHeader({ name: 'x-store-slug', required: false, description: 'Slug da loja (ou use o domínio customizado)' })
@Public()
@Controller('store')
export class StorefrontCatalogController {
  constructor(
    private readonly catalog: StorefrontCatalogService,
    private readonly taxonomy: TaxonomyService,
  ) {}

  @Get('products')
  list(@PublicStore() store: StoreContext, @ZodQuery(productListQuery) query: z.infer<typeof productListQuery>) {
    return this.catalog.list(store.id, query);
  }

  @Get('products/suggest')
  suggest(@PublicStore() store: StoreContext, @Query('q') q = '') {
    return this.catalog.suggest(store.id, q.slice(0, 80));
  }

  @Get('products/by-ids')
  byIds(@PublicStore() store: StoreContext, @Query('ids') ids = '') {
    return this.catalog.byIds(store.id, ids.split(',').filter((i) => /^[0-9a-f-]{36}$/.test(i)));
  }

  @Get('products/:slug')
  detail(@PublicStore() store: StoreContext, @Param('slug') slug: string) {
    return this.catalog.bySlug(store.id, slug);
  }

  @Get('products/:slug/related')
  related(@PublicStore() store: StoreContext, @Param('slug') slug: string) {
    return this.catalog.related(store.id, slug);
  }

  @Get('categories')
  categories(@PublicStore() store: StoreContext) {
    return this.taxonomy.tree(store.id);
  }

  @Get('brands')
  brands(@PublicStore() store: StoreContext) {
    return this.taxonomy.listBrands(store.id, true);
  }

  @Get('collections')
  collections(@PublicStore() store: StoreContext) {
    return this.taxonomy.listCollections(store.id, true);
  }
}
