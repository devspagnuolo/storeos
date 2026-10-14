import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus, StockMovementType } from '@prisma/client';
import { recordMovement } from '../inventory/stock-ledger';
import { PrismaService } from '../../shared/infrastructure/prisma.service';

export type ProductQuery = { category?: string; brand?: string; collection?: string; q?: string; page?: number; pageSize?: number };
export type CreateProductInput = { name: string; slug: string; sku: string; price: number; description?: string; categoryIds?: string[]; status?: ProductStatus; stock?: number; imageUrl?: string; brandId?: string | null; seoTitle?: string; seoDescription?: string; weightGrams?: number | null; widthCm?: number | null; heightCm?: number | null; lengthCm?: number | null };
export type UpdateProductInput = Partial<Omit<CreateProductInput, 'sku'>> & { sku?: string };
export type CreateBrandInput = { name: string; slug: string; logoUrl?: string };
export type CollectionInput = { name?: string; slug?: string; description?: string; active?: boolean; position?: number; skus?: string[] };
export type CreateCategoryInput = { name: string; slug: string; description?: string; position?: number; parentId?: string | null };
export type VariantInput = { id?: string; sku: string; attributes: { name: string; value: string }[]; price?: number | null; stock: number; active?: boolean };
export type UpdateCategoryInput = Partial<CreateCategoryInput>;

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  private async storeId(slug: string) {
    const store = await this.prisma.store.findUnique({ where: { slug }, select: { id: true } });
    return store?.id;
  }

  async listPublic(storeSlug: string, query: ProductQuery = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 24;
    const storeId = await this.storeId(storeSlug);
    if (!storeId) return { items: [], total: 0, page, pageSize };
    const q = query.q?.trim();
    const where: Prisma.ProductWhereInput = {
      storeId,
      status: ProductStatus.ACTIVE,
      ...(query.category && { categories: { some: { category: { OR: [{ slug: query.category }, { parent: { slug: query.category } }] } } } }),
      ...(query.brand && { brand: { slug: query.brand } }),
      ...(query.collection && { collections: { some: { collection: { slug: query.collection, active: true } } } }),
      ...(q && { OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }, { sku: { equals: q, mode: 'insensitive' } }] }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, include: { images: { orderBy: { position: 'asc' }, take: 1 } }, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.product.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async bySlug(storeSlug: string, slug: string) {
    const storeId = await this.storeId(storeSlug);
    const product = storeId && await this.prisma.product.findFirst({
      where: { storeId, slug, status: ProductStatus.ACTIVE },
      include: { brand: { select: { name: true, slug: true } }, images: { orderBy: { position: 'asc' } }, variants: { where: { active: true }, orderBy: { position: 'asc' } }, inventory: true, categories: { include: { category: { select: { name: true, slug: true } } } } },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');
    const { inventory, categories, variants, ...rest } = product;
    const free = (rows: typeof inventory) => rows.reduce((sum, i) => sum + Math.max(i.quantity - i.reserved, 0), 0);
    // Com variações, o saldo vive em cada uma; sem elas, no produto.
    const withStock = variants.map(v => ({ ...v, available: free(inventory.filter(i => i.variantId === v.id)) }));
    const available = variants.length ? free(inventory.filter(i => i.variantId && variants.some(v => v.id === i.variantId))) : free(inventory.filter(i => !i.variantId));
    return { ...rest, variants: withStock, available, categories: categories.map(c => c.category) };
  }

  async categories(storeSlug: string) {
    const storeId = await this.storeId(storeSlug);
    if (!storeId) return [];
    return this.prisma.category.findMany({ where: { storeId }, orderBy: [{ position: 'asc' }, { name: 'asc' }], select: { id: true, name: true, slug: true, description: true, parentId: true } });
  }

  /** Duas camadas (categoria e subcategoria) bastam para o catálogo e mantêm menus e filtros simples. */
  private async assertParent(storeId: string, parentId: string | null | undefined, selfId?: string) {
    if (!parentId) return;
    if (parentId === selfId) throw new BadRequestException('Uma categoria não pode ser subcategoria dela mesma');
    const parent = await this.prisma.category.findFirst({ where: { id: parentId, storeId } });
    if (!parent) throw new BadRequestException('Categoria pai inválida');
    if (parent.parentId) throw new BadRequestException('Só há dois níveis: escolha uma categoria principal como pai');
    if (selfId && (await this.prisma.category.count({ where: { storeId, parentId: selfId } })) > 0) throw new BadRequestException('Esta categoria já tem subcategorias e não pode virar subcategoria');
  }

  async createCategory(storeId: string, dto: CreateCategoryInput) {
    await this.assertParent(storeId, dto.parentId);
    try {
      return await this.prisma.category.create({ data: { ...dto, storeId } });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Já existe uma categoria com essa URL nesta loja');
      throw error;
    }
  }

  async updateCategory(storeId: string, id: string, dto: UpdateCategoryInput) {
    if (!(await this.prisma.category.findFirst({ where: { id, storeId } }))) throw new NotFoundException('Categoria não encontrada');
    if (dto.parentId !== undefined) await this.assertParent(storeId, dto.parentId, id);
    try {
      return await this.prisma.category.update({ where: { id }, data: dto });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Já existe uma categoria com essa URL nesta loja');
      throw error;
    }
  }

  /** As subcategorias sobem para o nível principal e os produtos só perdem o vínculo com esta categoria. */
  async deleteCategory(storeId: string, id: string) {
    const { count } = await this.prisma.category.deleteMany({ where: { id, storeId } });
    if (!count) throw new NotFoundException('Categoria não encontrada');
  }

  private async assertBrand(storeId: string, brandId?: string | null) {
    if (brandId && !await this.prisma.brand.count({ where: { storeId, id: brandId } })) throw new BadRequestException('Marca inválida');
  }

  brands(storeSlug: string) {
    return this.storeId(storeSlug).then(storeId => storeId ? this.prisma.brand.findMany({ where: { storeId }, orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, logoUrl: true } }) : []);
  }

  async createBrand(storeId: string, dto: CreateBrandInput) {
    try {
      return await this.prisma.brand.create({ data: { ...dto, storeId } });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Já existe uma marca com essa URL nesta loja');
      throw error;
    }
  }

  async collections(storeSlug: string) {
    const storeId = await this.storeId(storeSlug);
    if (!storeId) return [];
    return this.prisma.collection.findMany({ where: { storeId, active: true }, orderBy: [{ position: 'asc' }, { name: 'asc' }], select: { id: true, name: true, slug: true, description: true } });
  }

  async adminCollections(storeId: string) {
    const rows = await this.prisma.collection.findMany({ where: { storeId }, orderBy: [{ position: 'asc' }, { name: 'asc' }], include: { products: { include: { product: { select: { sku: true } } }, orderBy: { position: 'asc' } } } });
    return rows.map(({ products, ...c }) => ({ ...c, skus: products.map(p => p.product.sku) }));
  }

  /** SKUs desconhecidos são recusados em vez de ignorados, para o lojista perceber um erro de digitação. */
  private async productsBySkus(storeId: string, skus: string[]) {
    const unique = [...new Set(skus.map(sku => sku.trim()).filter(Boolean))];
    const found = await this.prisma.product.findMany({ where: { storeId, sku: { in: unique } }, select: { id: true, sku: true } });
    const missing = unique.filter(sku => !found.some(p => p.sku === sku));
    if (missing.length) throw new BadRequestException(`SKU não encontrado: ${missing.slice(0, 5).join(', ')}`);
    return unique.map(sku => found.find(p => p.sku === sku)!.id);
  }

  async createCollection(storeId: string, { skus = [], ...dto }: CollectionInput & { name: string; slug: string }) {
    const productIds = await this.productsBySkus(storeId, skus);
    try {
      return await this.prisma.collection.create({ data: { ...dto, storeId, products: { create: productIds.map((productId, position) => ({ productId, position })) } } });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Já existe uma coleção com essa URL nesta loja');
      throw error;
    }
  }

  async updateCollection(storeId: string, id: string, { skus, ...dto }: CollectionInput) {
    if (!await this.prisma.collection.count({ where: { id, storeId } })) throw new NotFoundException('Coleção não encontrada');
    const productIds = skus && await this.productsBySkus(storeId, skus);
    try {
      return await this.prisma.$transaction(async tx => {
        const updated = await tx.collection.update({ where: { id }, data: dto });
        if (productIds) {
          await tx.collectionProduct.deleteMany({ where: { collectionId: id } });
          await tx.collectionProduct.createMany({ data: productIds.map((productId, position) => ({ collectionId: id, productId, position })) });
        }
        return updated;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Já existe uma coleção com essa URL nesta loja');
      throw error;
    }
  }

  private async assertCategories(storeId: string, categoryIds: string[]) {
    const unique = [...new Set(categoryIds)];
    const count = unique.length ? await this.prisma.category.count({ where: { storeId, id: { in: unique } } }) : 0;
    if (count !== unique.length) throw new BadRequestException('Categoria inválida');
    return unique;
  }

  async create(storeId: string, { categoryIds = [], stock = 0, imageUrl, status = ProductStatus.DRAFT, ...dto }: CreateProductInput) {
    const categories = await this.assertCategories(storeId, categoryIds);
    await this.assertBrand(storeId, dto.brandId);
    try {
      return await this.prisma.$transaction(async tx => {
        const product = await tx.product.create({ data: { ...dto, storeId, status, categories: { create: categories.map(categoryId => ({ categoryId })) }, ...(imageUrl && { images: { create: { url: imageUrl, alt: dto.name } } }) } });
        await tx.inventory.create({ data: { storeId, productId: product.id, quantity: stock } });
        await recordMovement(tx, { storeId, productId: product.id, type: StockMovementType.INITIAL, delta: stock, reason: 'Cadastro do produto' });
        await tx.outboxEvent.create({ data: { storeId, aggregateType: 'Product', aggregateId: product.id, eventName: 'catalog.product-created.v1', payload: { sku: product.sku } } });
        return product;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('SKU ou URL já existem nesta loja');
      throw error;
    }
  }

  /** Atualiza dados, status, categorias, imagem principal e saldo físico (o reservado não muda aqui). */
  async update(storeId: string, id: string, { categoryIds, stock, imageUrl, ...dto }: UpdateProductInput) {
    const existing = await this.prisma.product.findFirst({ where: { id, storeId }, include: { inventory: true, _count: { select: { variants: true } } } });
    if (!existing) throw new NotFoundException('Produto não encontrado');
    const categories = categoryIds && await this.assertCategories(storeId, categoryIds);
    await this.assertBrand(storeId, dto.brandId);
    const inventory = existing.inventory.find(i => !i.variantId);
    // Com variações, o saldo é de cada uma e o campo único é ignorado.
    if (existing._count.variants) stock = undefined;
    if (stock !== undefined && inventory && stock < inventory.reserved) throw new BadRequestException(`O estoque não pode ficar abaixo das ${inventory.reserved} unidades reservadas em pedidos pendentes`);
    try {
      return await this.prisma.$transaction(async tx => {
        const product = await tx.product.update({ where: { id }, data: dto });
        if (categories) {
          await tx.productCategory.deleteMany({ where: { productId: id } });
          await tx.productCategory.createMany({ data: categories.map(categoryId => ({ productId: id, categoryId })) });
        }
        if (stock !== undefined) {
          if (inventory) await tx.inventory.update({ where: { id: inventory.id }, data: { quantity: stock } });
          else await tx.inventory.create({ data: { storeId, productId: id, quantity: stock } });
          await recordMovement(tx, { storeId, productId: id, type: StockMovementType.ADJUSTMENT, delta: stock - (inventory?.quantity ?? 0), reason: 'Edição do produto' });
        }
        if (imageUrl !== undefined) {
          const main = await tx.productImage.findFirst({ where: { productId: id }, orderBy: { position: 'asc' } });
          if (!imageUrl) { if (main) await tx.productImage.delete({ where: { id: main.id } }); }
          else if (main) await tx.productImage.update({ where: { id: main.id }, data: { url: imageUrl } });
          else await tx.productImage.create({ data: { productId: id, url: imageUrl, alt: product.name } });
        }
        if (dto.status === ProductStatus.ACTIVE && existing.status !== ProductStatus.ACTIVE) {
          await tx.outboxEvent.create({ data: { storeId, aggregateType: 'Product', aggregateId: id, eventName: 'catalog.product-published.v1', payload: { sku: product.sku } } });
        }
        return product;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('SKU ou URL já existem nesta loja');
      throw error;
    }
  }

  async adminList(storeId: string, { q, status, page = 1, pageSize = 20 }: { q?: string; status?: ProductStatus; page?: number; pageSize?: number }) {
    const term = q?.trim();
    const where: Prisma.ProductWhereInput = { storeId, ...(status && { status }), ...(term && { OR: [{ name: { contains: term, mode: 'insensitive' } }, { sku: { contains: term, mode: 'insensitive' } }] }) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, include: { images: { orderBy: { position: 'asc' }, take: 1 }, inventory: true, _count: { select: { variants: true } } }, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.product.count({ where }),
    ]);
    // Produto com variações mostra a soma dos saldos delas.
    return { items: items.map(({ inventory, _count, ...p }) => { const rows = _count.variants ? inventory.filter(i => i.variantId) : inventory.filter(i => !i.variantId); return { ...p, variantCount: _count.variants, stock: rows.reduce((s, i) => s + i.quantity, 0), reserved: rows.reduce((s, i) => s + i.reserved, 0) }; }), total, page, pageSize };
  }

  async adminGet(storeId: string, id: string) {
    const product = await this.prisma.product.findFirst({ where: { id, storeId }, include: { images: { orderBy: { position: 'asc' } }, inventory: true, categories: true, variants: { orderBy: { position: 'asc' } } } });
    if (!product) throw new NotFoundException('Produto não encontrado');
    const { inventory, categories, variants, ...rest } = product;
    const base = inventory.find(i => !i.variantId);
    return {
      ...rest, stock: base?.quantity ?? 0, reserved: base?.reserved ?? 0, categoryIds: categories.map(c => c.categoryId),
      variants: variants.map(v => { const row = inventory.find(i => i.variantId === v.id); return { ...v, stock: row?.quantity ?? 0, reserved: row?.reserved ?? 0 }; }),
    };
  }

  /**
   * Substitui as variações do produto (cor, tamanho…). Quem tem `id` é atualizado, quem não tem é criado e o que faltar é removido,
   * desde que não tenha unidades reservadas. Com variações o saldo passa a ser de cada uma; sem elas, volta a ser do produto.
   */
  async replaceVariants(storeId: string, productId: string, input: VariantInput[]) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, storeId }, include: { variants: { include: { inventory: true } }, inventory: { where: { variantId: null } } } });
    if (!product) throw new NotFoundException('Produto não encontrado');
    const skus = input.map(v => v.sku.trim());
    if (input.some(v => !v.attributes.length)) throw new BadRequestException('Cada variação precisa de ao menos um atributo (por exemplo, Cor)');
    const names = input.map(v => v.attributes.map(a => a.name.trim().toLowerCase()).join('|'));
    if (new Set(names).size > 1) throw new BadRequestException('Todas as variações devem usar os mesmos atributos, na mesma ordem');
    if (new Set(skus).size !== skus.length) throw new BadRequestException('Há SKUs repetidos nas variações');
    const combos = input.map(v => JSON.stringify(v.attributes.map(a => [a.name.trim().toLowerCase(), a.value.trim().toLowerCase()])));
    if (new Set(combos).size !== combos.length) throw new BadRequestException('Há combinações repetidas nas variações');
    const keep = new Set(input.filter(v => v.id).map(v => v.id));
    for (const id of keep) if (!product.variants.some(v => v.id === id)) throw new BadRequestException('Variação inválida');
    for (const variant of product.variants) {
      const reserved = variant.inventory.reduce((sum, row) => sum + row.reserved, 0);
      if (!keep.has(variant.id) && reserved > 0) throw new BadRequestException(`A variação ${variant.sku} tem ${reserved} unidades reservadas e não pode ser removida agora`);
    }
    for (const entry of input) {
      const row = entry.id ? product.variants.find(v => v.id === entry.id)?.inventory[0] : undefined;
      if (row && entry.stock < row.reserved) throw new BadRequestException(`O estoque de ${entry.sku} não pode ficar abaixo das ${row.reserved} unidades reservadas`);
    }
    try {
      await this.prisma.$transaction(async tx => {
        await tx.productVariant.deleteMany({ where: { productId, id: { notIn: [...keep] as string[] } } });
        for (const [position, entry] of input.entries()) {
          const data = { sku: entry.sku.trim(), attributes: entry.attributes.map(a => ({ name: a.name.trim(), value: a.value.trim() })) as Prisma.InputJsonArray, price: entry.price ?? null, active: entry.active ?? true, position };
          const variant = entry.id ? await tx.productVariant.update({ where: { id: entry.id }, data }) : await tx.productVariant.create({ data: { ...data, productId } });
          const row = await tx.inventory.findFirst({ where: { storeId, productId, variantId: variant.id } });
          if (row) await tx.inventory.update({ where: { id: row.id }, data: { quantity: entry.stock } });
          else await tx.inventory.create({ data: { storeId, productId, variantId: variant.id, quantity: entry.stock } });
          await recordMovement(tx, { storeId, productId, variantId: variant.id, type: row ? StockMovementType.ADJUSTMENT : StockMovementType.INITIAL, delta: entry.stock - (row?.quantity ?? 0), reason: 'Edição das variações' });
        }
        // O saldo do produto só existe enquanto ele não tem variações.
        if (input.length) await tx.inventory.deleteMany({ where: { storeId, productId, variantId: null } });
        else if (!product.inventory.length) await tx.inventory.create({ data: { storeId, productId, quantity: 0 } });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Já existe uma variação com esse SKU neste produto');
      throw error;
    }
    return this.adminGet(storeId, productId);
  }
}
