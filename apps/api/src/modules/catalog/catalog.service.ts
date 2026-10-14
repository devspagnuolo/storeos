import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';

export type ProductQuery = { category?: string; q?: string; page?: number; pageSize?: number };
export type CreateProductInput = { name: string; slug: string; sku: string; price: number; description?: string; categoryIds?: string[]; status?: ProductStatus; stock?: number; imageUrl?: string };
export type UpdateProductInput = Partial<Omit<CreateProductInput, 'sku'>> & { sku?: string };
export type CreateCategoryInput = { name: string; slug: string; description?: string; position?: number };

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
      ...(query.category && { categories: { some: { category: { slug: query.category } } } }),
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
      include: { images: { orderBy: { position: 'asc' } }, variants: true, inventory: true, categories: { include: { category: { select: { name: true, slug: true } } } } },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');
    const { inventory, categories, ...rest } = product;
    const available = inventory.filter(i => !i.variantId).reduce((sum, i) => sum + Math.max(i.quantity - i.reserved, 0), 0);
    return { ...rest, available, categories: categories.map(c => c.category) };
  }

  async categories(storeSlug: string) {
    const storeId = await this.storeId(storeSlug);
    if (!storeId) return [];
    return this.prisma.category.findMany({ where: { storeId }, orderBy: [{ position: 'asc' }, { name: 'asc' }], select: { id: true, name: true, slug: true, description: true } });
  }

  async createCategory(storeId: string, dto: CreateCategoryInput) {
    try {
      return await this.prisma.category.create({ data: { ...dto, storeId } });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Já existe uma categoria com essa URL nesta loja');
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
    try {
      return await this.prisma.$transaction(async tx => {
        const product = await tx.product.create({ data: { ...dto, storeId, status, categories: { create: categories.map(categoryId => ({ categoryId })) }, ...(imageUrl && { images: { create: { url: imageUrl, alt: dto.name } } }) } });
        await tx.inventory.create({ data: { storeId, productId: product.id, quantity: stock } });
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
    const existing = await this.prisma.product.findFirst({ where: { id, storeId }, include: { inventory: true } });
    if (!existing) throw new NotFoundException('Produto não encontrado');
    const categories = categoryIds && await this.assertCategories(storeId, categoryIds);
    const inventory = existing.inventory.find(i => !i.variantId);
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
      this.prisma.product.findMany({ where, include: { images: { orderBy: { position: 'asc' }, take: 1 }, inventory: { where: { variantId: null } } }, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.product.count({ where }),
    ]);
    return { items: items.map(({ inventory, ...p }) => ({ ...p, stock: inventory[0]?.quantity ?? 0, reserved: inventory[0]?.reserved ?? 0 })), total, page, pageSize };
  }

  async adminGet(storeId: string, id: string) {
    const product = await this.prisma.product.findFirst({ where: { id, storeId }, include: { images: { orderBy: { position: 'asc' } }, inventory: { where: { variantId: null } }, categories: true } });
    if (!product) throw new NotFoundException('Produto não encontrado');
    const { inventory, categories, ...rest } = product;
    return { ...rest, stock: inventory[0]?.quantity ?? 0, reserved: inventory[0]?.reserved ?? 0, categoryIds: categories.map(c => c.categoryId) };
  }
}
