import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';

export type ProductQuery = { category?: string; q?: string; page?: number; pageSize?: number };
export type CreateProductInput = { name: string; slug: string; sku: string; price: number; description?: string; categoryIds?: string[] };
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

  async create(storeId: string, { categoryIds = [], ...dto }: CreateProductInput) {
    const categoryCount = categoryIds.length ? await this.prisma.category.count({ where: { storeId, id: { in: categoryIds } } }) : 0;
    if (categoryCount !== new Set(categoryIds).size) throw new BadRequestException('Categoria inválida');
    try {
      return await this.prisma.$transaction(async tx => {
        const product = await tx.product.create({ data: { ...dto, storeId, status: ProductStatus.DRAFT, categories: { create: [...new Set(categoryIds)].map(categoryId => ({ categoryId })) } } });
        await tx.inventory.create({ data: { storeId, productId: product.id, quantity: 0 } });
        await tx.outboxEvent.create({ data: { storeId, aggregateType: 'Product', aggregateId: product.id, eventName: 'catalog.product-created.v1', payload: { sku: product.sku } } });
        return product;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('SKU ou URL já existem nesta loja');
      throw error;
    }
  }
}
