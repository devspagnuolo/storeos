import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  adminProductListQuery,
  brandInputSchema,
  categoryInputSchema,
  collectionInputSchema,
  createProductSchema,
  mediaInputSchema,
  updateProductSchema,
  variantInputSchema,
} from '@storeos/contracts';
import { z } from 'zod';
import { CurrentAuth, RequirePermissions } from '../../../shared/presentation/decorators/auth.decorators';
import { ZodBody, ZodQuery } from '../../../shared/presentation/pipes/zod';
import type { AuthContext } from '../../../shared/presentation/request.types';
import { ProductAdminService } from '../application/product-admin.service';
import { ProductImportService } from '../application/product-import.service';
import { TaxonomyService } from '../application/taxonomy.service';

@ApiTags('Admin · Catálogo')
@ApiBearerAuth()
@Controller('admin/catalog')
export class CatalogAdminController {
  constructor(
    private readonly products: ProductAdminService,
    private readonly taxonomy: TaxonomyService,
    private readonly importer: ProductImportService,
  ) {}

  // ── Produtos ──
  @RequirePermissions('catalog.read')
  @Get('products')
  list(@CurrentAuth() auth: AuthContext, @ZodQuery(adminProductListQuery) query: z.infer<typeof adminProductListQuery>) {
    return this.products.list(auth.storeId, query);
  }

  @RequirePermissions('catalog.read')
  @Get('products/:id')
  get(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.get(auth.storeId, id);
  }

  @RequirePermissions('catalog.write')
  @Post('products')
  create(@CurrentAuth() auth: AuthContext, @ZodBody(createProductSchema) body: z.infer<typeof createProductSchema>) {
    return this.products.create(auth.storeId, body, auth.subjectId);
  }

  @RequirePermissions('catalog.write')
  @Patch('products/:id')
  update(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @ZodBody(updateProductSchema) body: z.infer<typeof updateProductSchema>) {
    return this.products.update(auth.storeId, id, body, auth.subjectId);
  }

  @RequirePermissions('catalog.write')
  @HttpCode(204)
  @Delete('products/:id')
  async remove(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.products.remove(auth.storeId, id, auth.subjectId);
  }

  @RequirePermissions('catalog.write')
  @Post('products/:id/variants')
  addVariant(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @ZodBody(variantInputSchema) body: z.infer<typeof variantInputSchema>) {
    return this.products.addVariant(auth.storeId, id, body, auth.subjectId);
  }

  @RequirePermissions('catalog.write')
  @Post('products/:id/media')
  addMedia(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @ZodBody(mediaInputSchema) body: z.infer<typeof mediaInputSchema>) {
    return this.products.addMedia(auth.storeId, id, body);
  }

  @RequirePermissions('catalog.write')
  @HttpCode(204)
  @Delete('products/:id/media/:mediaId')
  async removeMedia(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Param('mediaId', ParseUUIDPipe) mediaId: string) {
    await this.products.removeMedia(auth.storeId, id, mediaId);
  }

  @RequirePermissions('catalog.write')
  @ApiOperation({ summary: 'Importa produtos por CSV (corpo text/csv)' })
  @ApiConsumes('text/csv')
  @Post('products/import')
  import(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    const csv = typeof body === 'string' ? body : (body as { csv?: string })?.csv ?? '';
    return this.importer.importCsv(auth.storeId, csv, auth.subjectId);
  }

  // ── Categorias ──
  @RequirePermissions('catalog.read')
  @Get('categories')
  categories(@CurrentAuth() auth: AuthContext) {
    return this.taxonomy.listCategoriesFlat(auth.storeId);
  }

  @RequirePermissions('catalog.write')
  @Post('categories')
  createCategory(@CurrentAuth() auth: AuthContext, @ZodBody(categoryInputSchema) body: z.infer<typeof categoryInputSchema>) {
    return this.taxonomy.createCategory(auth.storeId, body, auth.subjectId);
  }

  @RequirePermissions('catalog.write')
  @Patch('categories/:id')
  updateCategory(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @ZodBody(categoryInputSchema.partial()) body: Partial<z.infer<typeof categoryInputSchema>>) {
    return this.taxonomy.updateCategory(auth.storeId, id, body, auth.subjectId);
  }

  @RequirePermissions('catalog.write')
  @HttpCode(204)
  @Delete('categories/:id')
  async deleteCategory(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.taxonomy.deleteCategory(auth.storeId, id, auth.subjectId);
  }

  // ── Marcas ──
  @RequirePermissions('catalog.read')
  @Get('brands')
  brands(@CurrentAuth() auth: AuthContext) {
    return this.taxonomy.listBrands(auth.storeId);
  }

  @RequirePermissions('catalog.write')
  @Post('brands')
  createBrand(@CurrentAuth() auth: AuthContext, @ZodBody(brandInputSchema) body: z.infer<typeof brandInputSchema>) {
    return this.taxonomy.createBrand(auth.storeId, body);
  }

  @RequirePermissions('catalog.write')
  @Patch('brands/:id')
  updateBrand(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @ZodBody(brandInputSchema.partial()) body: Partial<z.infer<typeof brandInputSchema>>) {
    return this.taxonomy.updateBrand(auth.storeId, id, body);
  }

  // ── Coleções ──
  @RequirePermissions('catalog.read')
  @Get('collections')
  collections(@CurrentAuth() auth: AuthContext) {
    return this.taxonomy.listCollections(auth.storeId);
  }

  @RequirePermissions('catalog.write')
  @Post('collections')
  createCollection(@CurrentAuth() auth: AuthContext, @ZodBody(collectionInputSchema) body: z.infer<typeof collectionInputSchema>) {
    return this.taxonomy.createCollection(auth.storeId, body);
  }

  @RequirePermissions('catalog.write')
  @HttpCode(204)
  @Put('collections/:id/products')
  async setCollectionProducts(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(z.object({ productIds: z.array(z.string().uuid()) })) body: { productIds: string[] },
  ) {
    await this.taxonomy.setCollectionProducts(auth.storeId, id, body.productIds);
  }
}
