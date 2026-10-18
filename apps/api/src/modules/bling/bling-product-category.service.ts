import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { BlingAuthService } from './bling-auth.service';
import { BlingCategory, categoryPath } from './bling-mapper';
import { BlingClient } from './bling.client';

const PAGE = 100;
const SKU_BATCH = 50;

type Page<T> = { data?: T[] };
export type CategorySyncResult = { connected: boolean; updated: number; notFound: string[]; failed: { name: string; message: string }[] };

const key = (parts: string[]) => parts.map(part => part.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()).join(' > ');

/**
 * Leva a categoria que a loja deu aos produtos para o cadastro deles no Bling (o produto é achado pelo código/SKU).
 * A categoria é procurada pelo caminho ("Blusas > Manga Longa"); a que não existir no Bling é criada lá.
 */
@Injectable()
export class BlingProductCategoryService {
  constructor(private readonly prisma: PrismaService, private readonly auth: BlingAuthService, private readonly client: BlingClient) {}

  async push(storeId: string, productIds: string[]): Promise<CategorySyncResult> {
    const result: CategorySyncResult = { connected: false, updated: 0, notFound: [], failed: [] };
    if (!(await this.prisma.blingConnection.findUnique({ where: { storeId }, select: { storeId: true } }))) return result;
    result.connected = true;
    const products = await this.prisma.product.findMany({ where: { storeId, id: { in: [...new Set(productIds)].slice(0, 100) } }, select: { name: true, sku: true, categories: { select: { categoryId: true } } } });
    const nodes = await this.prisma.category.findMany({ where: { storeId }, select: { id: true, name: true, parentId: true } });
    const byId = new Map(nodes.map(node => [node.id, node]));
    const sitePath = (id: string) => {
      const path: string[] = [];
      const seen = new Set<string>();
      for (let node = byId.get(id); node && !seen.has(node.id); node = node.parentId ? byId.get(node.parentId) : undefined) { seen.add(node.id); path.unshift(node.name); }
      return path;
    };
    // Produto em mais de uma categoria vai para a mais específica (o Bling aceita só uma).
    const wanted = products.flatMap(product => {
      const path = product.categories.map(c => sitePath(c.categoryId)).sort((a, b) => b.length - a.length)[0];
      return path?.length && product.sku.trim() ? [{ ...product, sku: product.sku.trim(), path }] : [];
    });
    if (!wanted.length) return result;

    const call = async <T>(path: string, init?: { method?: string; body?: unknown }) => this.client.request<T>(await this.auth.accessToken(storeId), path, init);
    const blingCategories = new Map<number, BlingCategory>();
    for (let page = 1; page <= 20; page++) {
      const rows = (await call<Page<BlingCategory>>(`/categorias/produtos?pagina=${page}&limite=${PAGE}`)).data ?? [];
      rows.forEach(category => blingCategories.set(category.id, category));
      if (rows.length < PAGE) break;
    }
    const byPath = new Map([...blingCategories.keys()].map(id => [key(categoryPath(id, blingCategories)), id]));
    const categoryFor = async (path: string[]) => {
      let parentId: number | undefined;
      for (let level = 1; level <= path.length; level++) {
        const prefix = key(path.slice(0, level));
        let id = byPath.get(prefix);
        if (!id) {
          const created = await call<{ data?: { id?: number } }>('/categorias/produtos', { method: 'POST', body: { descricao: path[level - 1], ...(parentId && { categoriaPai: { id: parentId } }) } });
          if (!created?.data?.id) throw new Error(`O Bling não devolveu a categoria ${path.slice(0, level).join(' > ')}`);
          id = created.data.id;
          byPath.set(prefix, id);
        }
        parentId = id;
      }
      return parentId!;
    };

    const blingIds = new Map<string, number>();
    for (let i = 0; i < wanted.length; i += SKU_BATCH) {
      const skus = wanted.slice(i, i + SKU_BATCH).map(p => p.sku);
      const rows = (await call<Page<{ id: number; codigo?: string }>>('/produtos?' + new URLSearchParams([...skus.map(sku => ['codigos[]', sku]), ['limite', String(PAGE)]]))).data ?? [];
      rows.forEach(row => { if (row.codigo?.trim()) blingIds.set(row.codigo.trim().toLowerCase(), row.id); });
    }

    for (const product of wanted) {
      const blingId = blingIds.get(product.sku.toLowerCase());
      if (!blingId) { result.notFound.push(product.name); continue; }
      try {
        await call(`/produtos/${blingId}`, { method: 'PATCH', body: { categoria: { id: await categoryFor(product.path) } } });
        result.updated++;
      } catch (error) {
        result.failed.push({ name: product.name, message: (error as Error).message.slice(0, 300) });
      }
    }
    return result;
  }
}
