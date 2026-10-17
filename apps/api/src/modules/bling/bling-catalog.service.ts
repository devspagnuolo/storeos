import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { BlingAuthService } from './bling-auth.service';
import { BlingClient } from './bling.client';
import { DEFAULT_PRODUCT_CODE_FROM, byCode, meetsCodeFrom } from './bling-mapper';

const LIMIT = 50;
/** O Bling entrega no máximo 100 por página; 50 páginas cobrem 5 mil cadastros ativos. */
const BLING_PAGE = 100;
const MAX_BLING_PAGES = 50;
/** Guarda a lista do Bling por pouco tempo para que trocar de página não refaça todas as consultas. */
const CACHE_MS = 2 * 60_000;
type Listed = { id: number; nome?: string; codigo?: string; preco?: number; formato?: string; situacao?: string; imagemURL?: string; estoque?: { saldoVirtualTotal?: number } };

export type BlingCatalogItem = { id: number; sku: string | null; name: string; price: number; stock: number; hasVariations: boolean; imageUrl: string | null; inStore: boolean };

/** Lista os cadastros ativos do Bling para o lojista escolher o que trazer. Somente leitura. */
@Injectable()
export class BlingCatalogService {
  constructor(private readonly prisma: PrismaService, private readonly auth: BlingAuthService, private readonly client: BlingClient) {}

  private readonly cache = new Map<string, { at: number; rows: Listed[] }>();

  async list(storeId: string, { page = 1, q }: { page?: number; q?: string }) {
    const codeFrom = (await this.prisma.blingConnection.findUnique({ where: { storeId }, select: { productCodeFrom: true } }))?.productCodeFrom ?? DEFAULT_PRODUCT_CODE_FROM;
    const listed = await this.listed(storeId, q?.trim().slice(0, 100) ?? '');
    // Cadastros com código abaixo do mínimo (ou sem número) ficam fora da lista; os demais seguem o código em ordem crescente.
    const allowed = listed.filter(r => meetsCodeFrom(r.codigo, codeFrom)).sort(byCode);
    const rows = allowed.slice((page - 1) * LIMIT, page * LIMIT);
    const skus = rows.map(r => r.codigo?.trim().toLowerCase()).filter((s): s is string => Boolean(s));
    const known = skus.length ? await this.prisma.$queryRaw<{ sku: string }[]>(Prisma.sql`SELECT "sku" FROM "Product" WHERE "storeId" = ${storeId} AND lower("sku") IN (${Prisma.join(skus)})`) : [];
    const have = new Set(known.map(p => p.sku.toLowerCase()));
    const items: BlingCatalogItem[] = rows.map(r => ({
      id: r.id, sku: r.codigo?.trim() || null, name: r.nome ?? '(sem nome)', price: Math.round(Number(r.preco ?? 0) * 100) / 100,
      stock: Math.max(0, Math.floor(Number(r.estoque?.saldoVirtualTotal ?? 0))), hasVariations: r.formato === 'V',
      imageUrl: r.imagemURL && /^https:\/\//.test(r.imagemURL) ? r.imagemURL : null, inStore: Boolean(r.codigo && have.has(r.codigo.trim().toLowerCase())),
    }));
    return { items, page, pageSize: LIMIT, hasMore: page * LIMIT < allowed.length, total: allowed.length, codeFrom, hidden: listed.length - allowed.length };
  }

  /** O Bling não ordena pelo código, então a lista inteira de ativos é lida antes de ordenar e paginar aqui. */
  private async listed(storeId: string, name: string) {
    const key = `${storeId}:${name.toLowerCase()}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
    const token = await this.auth.accessToken(storeId);
    const rows: Listed[] = [];
    for (let page = 1; page <= MAX_BLING_PAGES; page++) {
      const params = new URLSearchParams({ pagina: String(page), limite: String(BLING_PAGE), criterio: '2', tipo: 'P' });
      if (name) params.set('nome', name);
      const data = (await this.client.request<{ data?: Listed[] }>(token, `/produtos?${params}`)).data ?? [];
      rows.push(...data);
      if (data.length < BLING_PAGE) break;
    }
    for (const [k, v] of this.cache) if (Date.now() - v.at >= CACHE_MS) this.cache.delete(k);
    this.cache.set(key, { at: Date.now(), rows });
    return rows;
  }
}

