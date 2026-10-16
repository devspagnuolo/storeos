import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MENU_KEYS, MenuItem, MenuKey, normalizeMenu, resolveMenu } from './menu-rules';
import { PrismaService } from '../../shared/infrastructure/prisma.service';

export type PageInput = {
  slug?: string; title?: string; body?: string; published?: boolean; showInFooter?: boolean; position?: number; seoDescription?: string;
  kind?: 'PAGE' | 'POST'; excerpt?: string; coverImageUrl?: string; authorName?: string;
};

const POST_SUMMARY = { slug: true, title: true, excerpt: true, coverImageUrl: true, authorName: true, publishedAt: true } as const;

const unique = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  private async storeId(slug: string) {
    return (await this.prisma.store.findUnique({ where: { slug }, select: { id: true } }))?.id;
  }

  async listPublished(storeSlug: string) {
    const storeId = await this.storeId(storeSlug);
    if (!storeId) return [];
    return this.prisma.page.findMany({ where: { storeId, published: true, kind: 'PAGE' }, orderBy: [{ position: 'asc' }, { title: 'asc' }], select: { slug: true, title: true, showInFooter: true } });
  }

  /** Artigos publicados do blog, do mais recente para o mais antigo. */
  async listPosts(storeSlug: string, limit = 12, page = 1) {
    const storeId = await this.storeId(storeSlug);
    if (!storeId) return { items: [], total: 0 };
    const where = { storeId, published: true, kind: 'POST' as const };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.page.findMany({ where, orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }], take: limit, skip: (page - 1) * limit, select: POST_SUMMARY }),
      this.prisma.page.count({ where }),
    ]);
    return { items, total };
  }

  async postBySlug(storeSlug: string, slug: string) {
    const storeId = await this.storeId(storeSlug);
    const post = storeId && await this.prisma.page.findFirst({ where: { storeId, slug, published: true, kind: 'POST' }, select: { ...POST_SUMMARY, body: true, seoDescription: true, updatedAt: true } });
    if (!post) throw new NotFoundException('Artigo não encontrado');
    return post;
  }

  async bySlug(storeSlug: string, slug: string) {
    const storeId = await this.storeId(storeSlug);
    const page = storeId && await this.prisma.page.findFirst({ where: { storeId, slug, published: true, kind: 'PAGE' }, select: { slug: true, title: true, body: true, seoDescription: true, updatedAt: true } });
    if (!page) throw new NotFoundException('Página não encontrada');
    return page;
  }

  adminList(storeId: string, kind: 'PAGE' | 'POST' = 'PAGE') {
    return this.prisma.page.findMany({
      where: { storeId, kind },
      orderBy: kind === 'POST' ? [{ publishedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }] : [{ position: 'asc' }, { title: 'asc' }],
    });
  }

  async create(storeId: string, input: PageInput & { slug: string; title: string; body: string }) {
    try {
      return await this.prisma.page.create({ data: { ...input, storeId, publishedAt: input.published ? new Date() : null } });
    } catch (error) {
      if (unique(error)) throw new ConflictException('Já existe uma página com essa URL');
      throw error;
    }
  }

  async update(storeId: string, id: string, input: PageInput) {
    try {
      const done = await this.prisma.page.updateMany({ where: { id, storeId }, data: input });
      if (!done.count) throw new NotFoundException('Página não encontrada');
      // A data do artigo é a da primeira publicação; editar depois não muda a ordem do blog.
      if (input.published) await this.prisma.page.updateMany({ where: { id, storeId, publishedAt: null }, data: { publishedAt: new Date() } });
    } catch (error) {
      if (unique(error)) throw new ConflictException('Já existe uma página com essa URL');
      throw error;
    }
    return this.prisma.page.findUniqueOrThrow({ where: { id } });
  }

  async remove(storeId: string, id: string) {
    const done = await this.prisma.page.deleteMany({ where: { id, storeId } });
    if (!done.count) throw new NotFoundException('Página não encontrada');
  }

  private menuKey(key: string): MenuKey {
    if (!MENU_KEYS.includes(key as MenuKey)) throw new NotFoundException('Menu não encontrado');
    return key as MenuKey;
  }

  /** Menu da vitrine já com os endereços; `configured: false` faz a vitrine usar o menu padrão. */
  async publicMenu(storeSlug: string, rawKey: string) {
    const key = this.menuKey(rawKey);
    const storeId = await this.storeId(storeSlug);
    const menu = storeId && await this.prisma.menu.findUnique({ where: { storeId_key: { storeId, key } } });
    if (!storeId || !menu) return { configured: false, items: [] };
    const [categories, collections, brands, pages] = await Promise.all([
      this.prisma.category.findMany({ where: { storeId }, select: { slug: true } }),
      this.prisma.collection.findMany({ where: { storeId, active: true }, select: { slug: true } }),
      this.prisma.brand.findMany({ where: { storeId }, select: { slug: true } }),
      this.prisma.page.findMany({ where: { storeId, published: true, kind: 'PAGE' }, select: { slug: true } }),
    ]);
    const set = (rows: { slug: string }[]) => new Set(rows.map(r => r.slug));
    return { configured: true, items: resolveMenu(menu.items as unknown as MenuItem[], { categories: set(categories), collections: set(collections), brands: set(brands), pages: set(pages) }) };
  }

  /** Menu em edição mais as opções de destino que o painel oferece. */
  async adminMenu(storeId: string, rawKey: string) {
    const key = this.menuKey(rawKey);
    const [menu, categories, collections, brands, pages] = await Promise.all([
      this.prisma.menu.findUnique({ where: { storeId_key: { storeId, key } } }),
      this.prisma.category.findMany({ where: { storeId }, select: { id: true, name: true, slug: true, parentId: true }, orderBy: [{ position: 'asc' }, { name: 'asc' }] }),
      this.prisma.collection.findMany({ where: { storeId }, select: { name: true, slug: true }, orderBy: { name: 'asc' } }),
      this.prisma.brand.findMany({ where: { storeId }, select: { name: true, slug: true }, orderBy: { name: 'asc' } }),
      this.prisma.page.findMany({ where: { storeId, published: true, kind: 'PAGE' }, select: { title: true, slug: true }, orderBy: { title: 'asc' } }),
    ]);
    return { key, configured: !!menu, items: (menu?.items ?? []) as unknown as MenuItem[], options: { categories, collections, brands, pages: pages.map(p => ({ name: p.title, slug: p.slug })) } };
  }

  async saveMenu(storeId: string, rawKey: string, rawItems: unknown) {
    const key = this.menuKey(rawKey);
    const items = normalizeMenu(rawItems) as unknown as Prisma.InputJsonArray;
    await this.prisma.menu.upsert({ where: { storeId_key: { storeId, key } }, create: { storeId, key, items }, update: { items } });
    return this.adminMenu(storeId, key);
  }

  /** Volta ao menu padrão da vitrine. */
  async resetMenu(storeId: string, rawKey: string) {
    const key = this.menuKey(rawKey);
    await this.prisma.menu.deleteMany({ where: { storeId, key } });
  }
}
