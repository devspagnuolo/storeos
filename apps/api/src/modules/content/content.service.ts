import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';

export type PageInput = { slug?: string; title?: string; body?: string; published?: boolean; showInFooter?: boolean; position?: number; seoDescription?: string };

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
    return this.prisma.page.findMany({ where: { storeId, published: true }, orderBy: [{ position: 'asc' }, { title: 'asc' }], select: { slug: true, title: true, showInFooter: true } });
  }

  async bySlug(storeSlug: string, slug: string) {
    const storeId = await this.storeId(storeSlug);
    const page = storeId && await this.prisma.page.findFirst({ where: { storeId, slug, published: true }, select: { slug: true, title: true, body: true, seoDescription: true, updatedAt: true } });
    if (!page) throw new NotFoundException('Página não encontrada');
    return page;
  }

  adminList(storeId: string) {
    return this.prisma.page.findMany({ where: { storeId }, orderBy: [{ position: 'asc' }, { title: 'asc' }] });
  }

  async create(storeId: string, input: PageInput & { slug: string; title: string; body: string }) {
    try {
      return await this.prisma.page.create({ data: { ...input, storeId } });
    } catch (error) {
      if (unique(error)) throw new ConflictException('Já existe uma página com essa URL');
      throw error;
    }
  }

  async update(storeId: string, id: string, input: PageInput) {
    try {
      const done = await this.prisma.page.updateMany({ where: { id, storeId }, data: input });
      if (!done.count) throw new NotFoundException('Página não encontrada');
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
}
