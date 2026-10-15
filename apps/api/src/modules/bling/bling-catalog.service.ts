import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { BlingAuthService } from './bling-auth.service';
import { BlingClient } from './bling.client';

const LIMIT = 50;
type Listed = { id: number; nome?: string; codigo?: string; preco?: number; formato?: string; situacao?: string; imagemURL?: string; estoque?: { saldoVirtualTotal?: number } };

export type BlingCatalogItem = { id: number; sku: string | null; name: string; price: number; stock: number; hasVariations: boolean; imageUrl: string | null; inStore: boolean };

/** Lista os cadastros ativos do Bling para o lojista escolher o que trazer. Somente leitura. */
@Injectable()
export class BlingCatalogService {
  constructor(private readonly prisma: PrismaService, private readonly auth: BlingAuthService, private readonly client: BlingClient) {}

  async list(storeId: string, { page = 1, q }: { page?: number; q?: string }) {
    const token = await this.auth.accessToken(storeId);
    const params = new URLSearchParams({ pagina: String(page), limite: String(LIMIT), criterio: '2', tipo: 'P' });
    if (q?.trim()) params.set('nome', q.trim().slice(0, 100));
    const rows = (await this.client.request<{ data?: Listed[] }>(token, `/produtos?${params}`)).data ?? [];
    const skus = rows.map(r => r.codigo?.trim().toLowerCase()).filter((s): s is string => Boolean(s));
    const known = skus.length ? await this.prisma.$queryRaw<{ sku: string }[]>(Prisma.sql`SELECT "sku" FROM "Product" WHERE "storeId" = ${storeId} AND lower("sku") IN (${Prisma.join(skus)})`) : [];
    const have = new Set(known.map(p => p.sku.toLowerCase()));
    const items: BlingCatalogItem[] = rows.map(r => ({
      id: r.id, sku: r.codigo?.trim() || null, name: r.nome ?? '(sem nome)', price: Math.round(Number(r.preco ?? 0) * 100) / 100,
      stock: Math.max(0, Math.floor(Number(r.estoque?.saldoVirtualTotal ?? 0))), hasVariations: r.formato === 'V',
      imageUrl: r.imagemURL && /^https:\/\//.test(r.imagemURL) ? r.imagemURL : null, inStore: Boolean(r.codigo && have.has(r.codigo.trim().toLowerCase())),
    }));
    return { items, page, pageSize: LIMIT, hasMore: rows.length === LIMIT };
  }
}
