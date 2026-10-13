import { Injectable } from '@nestjs/common';
import { slugify } from '../../../shared/domain/slug';
import { PrismaService, Tx } from '../../../shared/infrastructure/prisma/prisma.service';

type SluggedModel = 'product' | 'category' | 'brand' | 'collection';

@Injectable()
export class SlugService {
  constructor(private readonly prisma: PrismaService) {}

  /** Gera slug único por loja (sufixo numérico quando há colisão). */
  async unique(model: SluggedModel, storeId: string, wanted: string, ignoreId?: string, client: PrismaService | Tx = this.prisma): Promise<string> {
    const base = slugify(wanted) || 'item';
    for (let i = 0; i < 50; i += 1) {
      const candidate = i === 0 ? base : `${base}-${i + 1}`;
      const where = { storeId, slug: candidate, ...(ignoreId ? { NOT: { id: ignoreId } } : {}) };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const found = await (client[model] as any).findFirst({ where, select: { id: true } });
      if (!found) return candidate;
    }
    return `${base}-${Date.now().toString(36)}`;
  }
}
