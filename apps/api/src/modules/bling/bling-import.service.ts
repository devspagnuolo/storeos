import { Injectable, Logger } from '@nestjs/common';
import { BlingImportStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { ProductImportService } from '../catalog/product-import.service';
import { BlingAuthService } from './bling-auth.service';
import { BlingCategory, BlingProductDetail, toImportProduct } from './bling-mapper';
import { BlingClient } from './bling.client';

const PAGE = 100;
const MAX_PRODUCTS = 5000;
const STALE_MS = 30 * 60_000;

type Page<T> = { data?: T[] };
export type ImportMode = 'new' | 'update';
export const parseImportMode = (value: unknown): ImportMode => value === 'update' ? 'update' : 'new';

/** Importa o catálogo do Bling em segundo plano; o painel acompanha pela linha BlingImport. */
@Injectable()
export class BlingImportService {
  private readonly logger = new Logger(BlingImportService.name);

  constructor(private readonly prisma: PrismaService, private readonly auth: BlingAuthService, private readonly client: BlingClient, private readonly importer: ProductImportService) {}

  latest(storeId: string) {
    return this.prisma.blingImport.findFirst({ where: { storeId }, orderBy: { startedAt: 'desc' } });
  }

  /** Dispara a importação. Se já há uma rodando, devolve a mesma; uma que travou há mais de 30 min é dada como falha. */
  async start(storeId: string, wait = false, mode: ImportMode = 'new') {
    const current = await this.latest(storeId);
    if (current?.status === BlingImportStatus.RUNNING) {
      if (Date.now() - current.startedAt.getTime() < STALE_MS) return current;
      await this.prisma.blingImport.update({ where: { id: current.id }, data: { status: BlingImportStatus.FAILED, finishedAt: new Date(), errors: [{ message: 'A importação foi interrompida (servidor reiniciado).' }] } });
    }
    await this.auth.accessToken(storeId); // falha cedo e com mensagem clara se não estiver conectado
    const job = await this.prisma.blingImport.create({ data: { storeId, mode } });
    const running = this.run(storeId, job.id, mode);
    if (wait) await running;
    return job;
  }

  private async run(storeId: string, jobId: string, mode: ImportMode) {
    const errors: { sku?: string; message: string }[] = [];
    const counters = { total: 0, processed: 0, created: 0, updated: 0, failed: 0, skipped: 0 };
    const flush = () => this.prisma.blingImport.update({ where: { id: jobId }, data: { ...counters, errors: errors.slice(0, 50) as Prisma.InputJsonArray } });
    try {
      const get = async <T>(path: string) => this.client.request<T>(await this.auth.accessToken(storeId), path);
      const categories = new Map<number, BlingCategory>();
      for (let page = 1; page <= 20; page++) {
        const rows = (await get<Page<BlingCategory>>(`/categorias/produtos?pagina=${page}&limite=${PAGE}`)).data ?? [];
        rows.forEach(category => categories.set(category.id, category));
        if (rows.length < PAGE) break;
      }
      const ids: number[] = [];
      for (let page = 1; ids.length < MAX_PRODUCTS; page++) {
        // criterio=2: só produtos ativos; os inativos ficam de fora para não poluir a vitrine.
        const rows = (await get<Page<{ id: number }>>(`/produtos?pagina=${page}&limite=${PAGE}&criterio=2&tipo=P`)).data ?? [];
        ids.push(...rows.map(row => row.id));
        if (rows.length < PAGE) break;
      }
      counters.total = ids.length;
      await flush();

      const known = await this.prisma.product.findMany({ where: { storeId }, select: { id: true, sku: true, slug: true } });
      const bySku = new Map(known.map(p => [p.sku.toLowerCase(), p.id]));
      const slugs = new Set(known.map(p => p.slug));
      for (const id of ids) {
        try {
          const detail = (await get<{ data: BlingProductDetail }>(`/produtos/${id}`)).data;
          const existingId = detail.codigo ? bySku.get(detail.codigo.trim().toLowerCase()) : undefined;
          if (existingId && mode === 'new') { counters.skipped++; counters.processed++; continue; } // produto já existe: a loja manda
          const product = toImportProduct(detail, categories, counters.processed + 1, slug => !existingId && slugs.has(slug));
          if ('error' in product) throw new Error(product.error);
          await this.importer.save(storeId, product, existingId, { preserveCommercial: true });
          slugs.add(product.slug);
          bySku.set(product.sku.toLowerCase(), existingId ?? 'novo');
          counters[existingId ? 'updated' : 'created']++;
        } catch (error) {
          counters.failed++;
          errors.push({ message: `Produto ${id}: ${(error as Error).message}`.slice(0, 300) });
        }
        counters.processed++;
        if (counters.processed % 5 === 0) await flush();
      }
      await flush();
      await this.prisma.blingImport.update({ where: { id: jobId }, data: { status: BlingImportStatus.DONE, finishedAt: new Date() } });
    } catch (error) {
      this.logger.error(`Importação do Bling falhou: ${(error as Error).message}`);
      errors.push({ message: (error as Error).message.slice(0, 300) });
      await this.prisma.blingImport.update({ where: { id: jobId }, data: { ...counters, status: BlingImportStatus.FAILED, finishedAt: new Date(), errors: errors.slice(0, 50) as Prisma.InputJsonArray } });
    }
  }
}
