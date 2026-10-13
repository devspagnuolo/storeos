import { Injectable } from '@nestjs/common';
import type { CategoryInput, CategoryNode } from '@storeos/contracts';
import { BusinessRuleError, NotFoundError } from '../../../shared/domain/errors';
import { AuditService } from '../../../shared/infrastructure/audit/audit.service';
import { CacheService } from '../../../shared/infrastructure/cache/cache.service';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { SlugService } from './slug.service';

@Injectable()
export class TaxonomyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slugs: SlugService,
    private readonly cache: CacheService,
    private readonly audit: AuditService,
  ) {}

  // ── Categorias (árvore ilimitada, caminho materializado) ──

  async createCategory(storeId: string, input: CategoryInput, actorId?: string) {
    const parent = input.parentId ? await this.prisma.category.findFirst({ where: { id: input.parentId, storeId } }) : null;
    if (input.parentId && !parent) throw new NotFoundError('Categoria pai não encontrada', 'CATEGORY_NOT_FOUND');
    const slug = await this.slugs.unique('category', storeId, input.slug ?? input.name);
    const created = await this.prisma.category.create({
      data: {
        storeId,
        parentId: parent?.id,
        name: input.name,
        slug,
        path: parent ? `${parent.path}/${slug}` : slug,
        depth: parent ? parent.depth + 1 : 0,
        position: input.position,
        description: input.description,
        imageUrl: input.imageUrl,
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
        active: input.active,
      },
    });
    await this.invalidate(storeId);
    await this.audit.record({ storeId, action: 'catalog.category-created', entityType: 'Category', entityId: created.id, actorId });
    return created;
  }

  async updateCategory(storeId: string, id: string, input: Partial<CategoryInput>, actorId?: string) {
    const current = await this.prisma.category.findFirst({ where: { id, storeId } });
    if (!current) throw new NotFoundError('Categoria não encontrada', 'CATEGORY_NOT_FOUND');
    if (input.parentId !== undefined && input.parentId !== current.parentId) {
      return this.move(storeId, current.id, input.parentId, input, actorId);
    }
    const slug = input.slug && input.slug !== current.slug ? await this.slugs.unique('category', storeId, input.slug, id) : undefined;
    const updated = await this.prisma.runInTransaction(async (tx) => {
      const parent = current.parentId ? await tx.category.findUnique({ where: { id: current.parentId } }) : null;
      const newPath = slug ? (parent ? `${parent.path}/${slug}` : slug) : current.path;
      const row = await tx.category.update({
        where: { id },
        data: { name: input.name, slug, path: newPath, description: input.description, imageUrl: input.imageUrl, seoTitle: input.seoTitle, seoDescription: input.seoDescription, position: input.position, active: input.active },
      });
      if (newPath !== current.path) {
        const descendants = await tx.category.findMany({ where: { storeId, path: { startsWith: `${current.path}/` } } });
        for (const d of descendants) await tx.category.update({ where: { id: d.id }, data: { path: newPath + d.path.slice(current.path.length) } });
      }
      return row;
    });
    await this.invalidate(storeId);
    await this.audit.record({ storeId, action: 'catalog.category-updated', entityType: 'Category', entityId: id, actorId });
    return updated;
  }

  private async move(storeId: string, id: string, newParentId: string | null, input: Partial<CategoryInput>, actorId?: string) {
    const category = await this.prisma.category.findFirstOrThrow({ where: { id, storeId } });
    const parent = newParentId ? await this.prisma.category.findFirst({ where: { id: newParentId, storeId } }) : null;
    if (newParentId && !parent) throw new NotFoundError('Categoria pai não encontrada', 'CATEGORY_NOT_FOUND');
    if (parent && (parent.id === category.id || parent.path === category.path || parent.path.startsWith(`${category.path}/`))) {
      throw new BusinessRuleError('Uma categoria não pode ser movida para dentro dela mesma', 'CATEGORY_CYCLE');
    }
    const newPath = parent ? `${parent.path}/${category.slug}` : category.slug;
    const depthDelta = (parent ? parent.depth + 1 : 0) - category.depth;
    await this.prisma.runInTransaction(async (tx) => {
      const descendants = await tx.category.findMany({ where: { storeId, path: { startsWith: `${category.path}/` } } });
      await tx.category.update({
        where: { id },
        data: { parentId: parent?.id ?? null, path: newPath, depth: category.depth + depthDelta, name: input.name, description: input.description, position: input.position, active: input.active },
      });
      for (const d of descendants) {
        await tx.category.update({ where: { id: d.id }, data: { path: newPath + d.path.slice(category.path.length), depth: d.depth + depthDelta } });
      }
    });
    await this.invalidate(storeId);
    await this.audit.record({ storeId, action: 'catalog.category-moved', entityType: 'Category', entityId: id, actorId });
    return this.prisma.category.findFirstOrThrow({ where: { id, storeId } });
  }

  async deleteCategory(storeId: string, id: string, actorId?: string): Promise<void> {
    const category = await this.prisma.category.findFirst({ where: { id, storeId }, include: { _count: { select: { children: true, products: true } } } });
    if (!category) throw new NotFoundError('Categoria não encontrada', 'CATEGORY_NOT_FOUND');
    if (category._count.children > 0) throw new BusinessRuleError('Remova ou mova as subcategorias primeiro', 'CATEGORY_HAS_CHILDREN');
    await this.prisma.category.delete({ where: { id } });
    await this.invalidate(storeId);
    await this.audit.record({ storeId, action: 'catalog.category-deleted', entityType: 'Category', entityId: id, actorId });
  }

  listCategoriesFlat(storeId: string) {
    return this.prisma.category.findMany({ where: { storeId }, orderBy: [{ depth: 'asc' }, { position: 'asc' }, { name: 'asc' }] });
  }

  /** Árvore pública (somente ativas), em cache. */
  tree(storeId: string): Promise<CategoryNode[]> {
    return this.cache.wrap(`catalog:${storeId}:category-tree`, 300, async () => {
      const rows = await this.prisma.category.findMany({ where: { storeId, active: true }, orderBy: [{ position: 'asc' }, { name: 'asc' }] });
      const nodes = new Map<string, CategoryNode>(rows.map((r) => [r.id, { id: r.id, name: r.name, slug: r.slug, imageUrl: r.imageUrl, children: [] }]));
      const roots: CategoryNode[] = [];
      for (const row of rows) {
        const node = nodes.get(row.id)!;
        const parent = row.parentId ? nodes.get(row.parentId) : undefined;
        if (parent) parent.children.push(node);
        else if (!row.parentId) roots.push(node);
      }
      return roots;
    });
  }

  // ── Marcas ──

  async createBrand(storeId: string, input: { name: string; slug?: string; description?: string; logoUrl?: string; active: boolean }) {
    const slug = await this.slugs.unique('brand', storeId, input.slug ?? input.name);
    const brand = await this.prisma.brand.create({ data: { storeId, name: input.name, slug, description: input.description, logoUrl: input.logoUrl, active: input.active } });
    await this.invalidate(storeId);
    return brand;
  }

  async updateBrand(storeId: string, id: string, input: Partial<{ name: string; description: string; logoUrl: string; active: boolean }>) {
    const found = await this.prisma.brand.findFirst({ where: { id, storeId } });
    if (!found) throw new NotFoundError('Marca não encontrada', 'BRAND_NOT_FOUND');
    const brand = await this.prisma.brand.update({ where: { id }, data: input });
    await this.invalidate(storeId);
    return brand;
  }

  listBrands(storeId: string, onlyActive = false) {
    return this.cache.wrap(`catalog:${storeId}:brands:${onlyActive}`, 300, () =>
      this.prisma.brand.findMany({ where: { storeId, ...(onlyActive ? { active: true } : {}) }, orderBy: [{ position: 'asc' }, { name: 'asc' }] }),
    );
  }

  // ── Coleções ──

  async createCollection(storeId: string, input: { name: string; slug?: string; description?: string; imageUrl?: string; productIds: string[]; active: boolean }) {
    const slug = await this.slugs.unique('collection', storeId, input.slug ?? input.name);
    const valid = await this.prisma.product.findMany({ where: { storeId, id: { in: input.productIds }, deletedAt: null }, select: { id: true } });
    const collection = await this.prisma.collection.create({
      data: {
        storeId,
        name: input.name,
        slug,
        description: input.description,
        imageUrl: input.imageUrl,
        active: input.active,
        publishedAt: input.active ? new Date() : null,
        products: { create: valid.map((p, position) => ({ productId: p.id, position })) },
      },
    });
    await this.invalidate(storeId);
    return collection;
  }

  async setCollectionProducts(storeId: string, id: string, productIds: string[]) {
    const found = await this.prisma.collection.findFirst({ where: { id, storeId } });
    if (!found) throw new NotFoundError('Coleção não encontrada', 'COLLECTION_NOT_FOUND');
    const valid = await this.prisma.product.findMany({ where: { storeId, id: { in: productIds }, deletedAt: null }, select: { id: true } });
    await this.prisma.$transaction([
      this.prisma.collectionProduct.deleteMany({ where: { collectionId: id } }),
      this.prisma.collectionProduct.createMany({ data: valid.map((p, position) => ({ collectionId: id, productId: p.id, position })) }),
    ]);
    await this.invalidate(storeId);
  }

  listCollections(storeId: string, onlyActive = false) {
    return this.prisma.collection.findMany({
      where: { storeId, ...(onlyActive ? { active: true } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { products: true } } },
    });
  }

  private invalidate(storeId: string): Promise<void> {
    return this.cache.delByPrefix(`catalog:${storeId}:`);
  }
}
