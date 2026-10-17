import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BlingImportStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { ProductImportService } from '../catalog/product-import.service';
import { standardizeImage } from '../media/image-standard';
import { MediaService } from '../media/media.service';
import { RemoteImageService } from '../media/remote-image.service';
import { BlingStockService } from './bling-stock.service';
import { BlingAuthService } from './bling-auth.service';
import { BlingCategory, BlingProductDetail, byCode, DEFAULT_PRODUCT_CODE_FROM, meetsCodeFrom, toImportProduct } from './bling-mapper';
import { BlingClient } from './bling.client';

const PAGE = 100;
const MAX_PRODUCTS = 5000;
const MAX_SELECTED = 200;
const MAX_IMAGES = 6;
const STALE_MS = 30 * 60_000;

type Page<T> = { data?: T[] };
export type ImportMode = 'new' | 'update';
export const parseImportMode = (value: unknown): ImportMode => value === 'update' ? 'update' : 'new';

/** Importa o catálogo do Bling em segundo plano; o painel acompanha pela linha BlingImport. */
@Injectable()
export class BlingImportService {
  private readonly logger = new Logger(BlingImportService.name);

  constructor(private readonly prisma: PrismaService, private readonly auth: BlingAuthService, private readonly client: BlingClient, private readonly importer: ProductImportService, private readonly media: MediaService, private readonly remote: RemoteImageService, private readonly stock: BlingStockService) {}

  latest(storeId: string) {
    return this.prisma.blingImport.findFirst({ where: { storeId }, orderBy: { startedAt: 'desc' } });
  }

  /** Dispara a importação. Se já há uma rodando, devolve a mesma; uma que travou há mais de 30 min é dada como falha. */
  async start(storeId: string, wait = false, mode: ImportMode = 'new', ids?: number[]) {
    if (ids && (!ids.length || ids.length > MAX_SELECTED || ids.some(id => !Number.isInteger(id) || id <= 0))) throw new BadRequestException(`Escolha de 1 a ${MAX_SELECTED} produtos`);
    const current = await this.latest(storeId);
    if (current?.status === BlingImportStatus.RUNNING) {
      if (Date.now() - current.startedAt.getTime() < STALE_MS) return current;
      await this.prisma.blingImport.update({ where: { id: current.id }, data: { status: BlingImportStatus.FAILED, finishedAt: new Date(), errors: [{ message: 'A importação foi interrompida (servidor reiniciado).' }] } });
    }
    await this.auth.accessToken(storeId); // falha cedo e com mensagem clara se não estiver conectado
    const job = await this.prisma.blingImport.create({ data: { storeId, mode } });
    const running = this.run(storeId, job.id, mode, ids);
    if (wait) await running;
    return job;
  }

  /** Baixa cada foto do cadastro, ajusta para o tamanho padrão da loja e guarda a cópia. Foto com problema é avisada e ignorada. */
  private async standardImages(storeId: string, urls: string[], name: string, errors: { sku?: string; message: string }[]) {
    const saved: string[] = [];
    for (const url of urls.slice(0, MAX_IMAGES)) {
      try {
        const image = await standardizeImage(await this.remote.download(url));
        saved.push(await this.media.saveProcessed(storeId, 'product', { buffer: image.buffer, mimetype: image.mime, width: image.width, height: image.height, originalname: `${name}.jpg` }));
      } catch (error) {
        errors.push({ message: `${name}: foto ignorada (${(error as Error).message})`.slice(0, 300) });
      }
    }
    return saved;
  }

  private async run(storeId: string, jobId: string, mode: ImportMode, selected?: number[]) {
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
      const codeFrom = (await this.prisma.blingConnection.findUnique({ where: { storeId }, select: { productCodeFrom: true } }))?.productCodeFrom ?? DEFAULT_PRODUCT_CODE_FROM;
      const ids: number[] = selected ? [...new Set(selected)] : [];
      let belowCode = 0;
      const found: { id: number; codigo?: string }[] = [];
      for (let page = 1; !selected && found.length < MAX_PRODUCTS; page++) {
        // criterio=2: só produtos ativos; os inativos ficam de fora para não poluir a vitrine.
        const rows = (await get<Page<{ id: number; codigo?: string }>>(`/produtos?pagina=${page}&limite=${PAGE}&criterio=2&tipo=P`)).data ?? [];
        const allowed = rows.filter(row => meetsCodeFrom(row.codigo, codeFrom));
        belowCode += rows.length - allowed.length;
        found.push(...allowed);
        if (rows.length < PAGE) break;
      }
      // Importa na mesma ordem da lista: código crescente.
      ids.push(...found.sort(byCode).slice(0, MAX_PRODUCTS).map(row => row.id));
      if (belowCode) errors.push({ message: `${belowCode} produto(s) com código abaixo de ${codeFrom} (ou sem número) ficaram fora da importação.` });
      counters.total = ids.length;
      await flush();

      const known = await this.prisma.product.findMany({ where: { storeId }, select: { id: true, sku: true, slug: true } });
      const bySku = new Map(known.map(p => [p.sku.toLowerCase(), p.id]));
      const slugs = new Set(known.map(p => p.slug));
      for (const id of ids) {
        try {
          const detail = (await get<{ data: BlingProductDetail }>(`/produtos/${id}`)).data;
          if (!meetsCodeFrom(detail.codigo, codeFrom)) {
            counters.skipped++; counters.processed++;
            errors.push({ sku: detail.codigo, message: `${detail.nome ?? `Produto ${id}`}: código ${detail.codigo?.trim() || '(vazio)'} abaixo de ${codeFrom}, não importado`.slice(0, 300) });
            continue;
          }
          const existingId = detail.codigo ? bySku.get(detail.codigo.trim().toLowerCase()) : undefined;
          if (existingId && mode === 'new') { counters.skipped++; counters.processed++; continue; } // produto já existe: a loja manda
          const product = toImportProduct(detail, categories, counters.processed + 1, slug => !existingId && slugs.has(slug));
          if ('error' in product) throw new Error(product.error);
          if (product.imageUrls.length) {
            const hasPhotos = existingId ? await this.prisma.productImage.count({ where: { productId: existingId } }) > 0 : false;
            product.imageUrls = hasPhotos ? [] : await this.standardImages(storeId, product.imageUrls, product.name, errors);
          }
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
      if (selected) {
        // Quem escolhe produtos do Bling quer o saldo de lá: liga a sincronização e já iguala o estoque dos escolhidos.
        await this.stock.setEnabled(storeId, true).catch(() => undefined);
        await this.stock.sync(storeId).catch(error => errors.push({ message: `Estoque não sincronizado agora: ${(error as Error).message}`.slice(0, 300) }));
        await flush();
      }
      await this.prisma.blingImport.update({ where: { id: jobId }, data: { status: BlingImportStatus.DONE, finishedAt: new Date() } });
    } catch (error) {
      this.logger.error(`Importação do Bling falhou: ${(error as Error).message}`);
      errors.push({ message: (error as Error).message.slice(0, 300) });
      await this.prisma.blingImport.update({ where: { id: jobId }, data: { ...counters, status: BlingImportStatus.FAILED, finishedAt: new Date(), errors: errors.slice(0, 50) as Prisma.InputJsonArray } });
    }
  }
}
