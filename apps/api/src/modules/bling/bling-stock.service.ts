import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { BlingSyncStatus, StockMovementType } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { recordMovement } from '../inventory/stock-ledger';
import { BlingAuthService } from './bling-auth.service';
import { BlingItem, planStockSync, reconcile, SiteItem } from './bling-reconcile';
import { BlingClient } from './bling.client';
import { BlingProductDetail } from './bling-mapper';

const PAGE = 100;
const MAX_PAGES = 30;
const SALDO_BATCH = 50;
const REASON = 'Sincronização Bling';

type Listing<T> = { data?: T[] };
type ListedProduct = { id: number; nome?: string; codigo?: string; preco?: number; formato?: string; situacao?: string };
type Balance = { produto?: { id?: number }; saldoVirtualTotal?: number };
const units = (value: unknown) => Math.max(0, Math.floor(Number(value ?? 0)));
const money = (value: unknown) => Math.round(Number(value ?? 0) * 100) / 100;

/**
 * Bling é o sistema principal: este serviço confere preço/estoque contra ele e, quando o lojista liga a sincronização,
 * copia os saldos do Bling para a loja com lançamento no razão de estoque.
 */
@Injectable()
export class BlingStockService {
  private readonly logger = new Logger(BlingStockService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly auth: BlingAuthService, private readonly client: BlingClient) {}

  @Interval(10 * 60_000)
  async tick() {
    if (this.running || process.env.OUTBOX_WORKER === 'off' || process.env.BLING_WORKER === 'off') return;
    this.running = true;
    try {
      const stores = await this.prisma.blingConnection.findMany({ where: { stockSyncEnabled: true }, select: { storeId: true } });
      for (const { storeId } of stores) await this.sync(storeId).catch(error => this.logger.error(`Sincronização de estoque falhou (${storeId}): ${(error as Error).message}`));
    } finally {
      this.running = false;
    }
  }

  async fetchBling(storeId: string): Promise<{ items: BlingItem[]; truncated: boolean }> {
    const get = async <T>(path: string) => this.client.request<T>(await this.auth.accessToken(storeId), path);
    const listed: ListedProduct[] = [];
    let truncated = false;
    for (let page = 1; ; page++) {
      if (page > MAX_PAGES) { truncated = true; break; }
      const rows = (await get<Listing<ListedProduct>>(`/produtos?pagina=${page}&limite=${PAGE}&criterio=2&tipo=P`)).data ?? [];
      listed.push(...rows);
      if (rows.length < PAGE) break;
    }
    const items: BlingItem[] = [];
    const simple = listed.filter(product => product.formato !== 'V');
    const balances = new Map<number, number>();
    for (let i = 0; i < simple.length; i += SALDO_BATCH) {
      const query = simple.slice(i, i + SALDO_BATCH).map(product => `idsProdutos[]=${product.id}`).join('&');
      for (const row of (await get<Listing<Balance>>(`/estoques/saldos?${query}`)).data ?? []) if (row.produto?.id) balances.set(row.produto.id, units(row.saldoVirtualTotal));
    }
    for (const product of simple) {
      if (!product.codigo?.trim()) continue;
      items.push({ sku: product.codigo.trim(), name: product.nome ?? product.codigo, price: money(product.preco), stock: balances.get(product.id) ?? 0, active: product.situacao === 'A' });
    }
    for (const parent of listed.filter(product => product.formato === 'V')) {
      const detail = (await get<{ data: BlingProductDetail }>(`/produtos/${parent.id}`)).data;
      for (const variation of detail.variacoes ?? []) {
        if (!variation.codigo?.trim()) continue;
        items.push({ sku: variation.codigo.trim(), name: `${detail.nome} ${variation.variacao?.nome ?? ''}`.trim(), price: money(variation.preco ?? detail.preco), stock: units(variation.estoque?.saldoVirtualTotal), active: parent.situacao === 'A' });
      }
    }
    return { items, truncated };
  }

  private async siteItems(storeId: string): Promise<SiteItem[]> {
    const products = await this.prisma.product.findMany({ where: { storeId }, include: { variants: true, inventory: true } });
    const items: SiteItem[] = [];
    for (const product of products) {
      const stock = (variantId: string | null) => product.inventory.find(row => row.variantId === variantId);
      if (product.variants.length) {
        for (const variant of product.variants) {
          const row = stock(variant.id);
          items.push({ sku: variant.sku, name: product.name, price: Number(variant.price ?? product.price), stock: row?.quantity ?? 0, reserved: row?.reserved ?? 0, active: product.status === 'ACTIVE', productId: product.id, variantId: variant.id });
        }
      } else {
        const row = stock(null);
        items.push({ sku: product.sku, name: product.name, price: Number(product.price), stock: row?.quantity ?? 0, reserved: row?.reserved ?? 0, active: product.status === 'ACTIVE', productId: product.id, variantId: null });
      }
    }
    return items;
  }

  async report(storeId: string) {
    const [{ items, truncated }, site] = await Promise.all([this.fetchBling(storeId), this.siteItems(storeId)]);
    const diff = reconcile(items, site);
    const cap = 200;
    return {
      checkedAt: new Date().toISOString(), truncated,
      summary: { ...diff.summary, onlyInBling: diff.onlyInBling.length, onlyOnSite: diff.onlyOnSite.length, stockDiffs: diff.stock.length, priceDiffs: diff.price.length },
      onlyInBling: diff.onlyInBling.slice(0, cap), onlyOnSite: diff.onlyOnSite.slice(0, cap), stock: diff.stock.slice(0, cap), price: diff.price.slice(0, cap),
    };
  }

  /** SKUs de pedidos que a loja já vendeu mas o Bling ainda não baixou: o saldo de lá ainda não os considera. */
  private async pendingSkus(storeId: string) {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const rows = await this.prisma.orderItem.findMany({
      where: { order: { storeId, createdAt: { gte: since }, status: { notIn: ['NEW', 'AWAITING_PAYMENT', 'CANCELLED'] }, OR: [{ blingSync: null }, { blingSync: { is: { status: { in: [BlingSyncStatus.PENDING, BlingSyncStatus.PROCESSING, BlingSyncStatus.FAILED] } } } }, { blingSync: { is: { status: BlingSyncStatus.SENT, postedAt: null } } }] } },
      select: { sku: true },
    });
    return new Set(rows.map(row => row.sku.trim().toLowerCase()));
  }

  async sync(storeId: string) {
    try {
      const [{ items }, site, pending] = await Promise.all([this.fetchBling(storeId), this.siteItems(storeId), this.pendingSkus(storeId)]);
      const plan = planStockSync(reconcile(items, site).stock, pending);
      let applied = 0;
      for (const change of plan.apply) {
        await this.prisma.$transaction(async tx => {
          const row = await tx.inventory.findFirst({ where: { storeId, productId: change.productId, variantId: change.variantId } });
          if (!row) return;
          const target = Math.max(change.to, row.reserved);
          if (target === row.quantity) return;
          await tx.inventory.update({ where: { id: row.id }, data: { quantity: target } });
          await recordMovement(tx, { storeId, productId: change.productId, variantId: change.variantId, type: StockMovementType.ADJUSTMENT, delta: target - row.quantity, reason: REASON, actorId: 'bling' });
          applied++;
        });
      }
      await this.prisma.blingConnection.update({ where: { storeId }, data: { stockSyncedAt: new Date(), stockSyncError: null } });
      return { applied, skipped: plan.skipped.slice(0, 100), skippedCount: plan.skipped.length };
    } catch (error) {
      await this.prisma.blingConnection.updateMany({ where: { storeId }, data: { stockSyncError: (error as Error).message.slice(0, 300) } });
      throw error;
    }
  }

  /**
   * Atualização na hora (aviso do Bling): lê o saldo atual destes cadastros no Bling e copia para a loja.
   * Cadastro com variações traz o saldo de cada variação. Só vale com a sincronização de estoque ligada.
   */
  async refreshProducts(storeId: string, blingProductIds: number[]) {
    const connection = await this.prisma.blingConnection.findUnique({ where: { storeId }, select: { stockSyncEnabled: true } });
    const ids = [...new Set(blingProductIds.filter(id => Number.isSafeInteger(id) && id > 0))].slice(0, 50);
    if (!connection?.stockSyncEnabled || !ids.length) return 0;
    const get = async <T>(path: string) => this.client.request<T>(await this.auth.accessToken(storeId), path);
    const codes = new Map<number, string>();
    for (const id of ids) {
      const detail = (await get<{ data?: BlingProductDetail }>(`/produtos/${id}`)).data;
      if (!detail) continue;
      if (detail.formato === 'V') detail.variacoes?.forEach(v => { if (v.codigo?.trim()) codes.set(v.id, v.codigo.trim()); });
      else if (detail.codigo?.trim()) codes.set(detail.id ?? id, detail.codigo.trim());
    }
    if (!codes.size) return 0;
    const balances = new Map<number, number>();
    const all = [...codes.keys()];
    for (let i = 0; i < all.length; i += SALDO_BATCH) {
      const query = all.slice(i, i + SALDO_BATCH).map(id => `idsProdutos[]=${id}`).join('&');
      for (const row of (await get<Listing<Balance>>(`/estoques/saldos?${query}`)).data ?? []) if (row.produto?.id) balances.set(row.produto.id, units(row.saldoVirtualTotal));
    }
    const pending = await this.pendingSkus(storeId);
    let applied = 0;
    for (const [id, sku] of codes) {
      // Venda do site ainda não baixada no Bling: o saldo de lá está atrasado; a baixa gera outro aviso.
      if (!balances.has(id) || pending.has(sku.toLowerCase())) continue;
      if (await this.applyBalance(storeId, sku, balances.get(id)!)) applied++;
    }
    if (applied) await this.prisma.blingConnection.update({ where: { storeId }, data: { stockSyncedAt: new Date(), stockSyncError: null } });
    return applied;
  }

  /** Itens de um pedido de venda do Bling (venda feita fora do site): atualiza o saldo de cada produto vendido. */
  async refreshFromSalesOrder(storeId: string, blingOrderId: string) {
    const connection = await this.prisma.blingConnection.findUnique({ where: { storeId }, select: { stockSyncEnabled: true } });
    if (!connection?.stockSyncEnabled) return 0;
    const order = (await this.client.request<{ data?: { itens?: { produto?: { id?: number } }[] } }>(await this.auth.accessToken(storeId), `/pedidos/vendas/${encodeURIComponent(blingOrderId)}`)).data;
    return this.refreshProducts(storeId, (order?.itens ?? []).map(item => Number(item.produto?.id)));
  }

  /** Copia o saldo do Bling para a linha de estoque do SKU (produto simples ou variação), nunca abaixo do reservado. */
  private async applyBalance(storeId: string, sku: string, balance: number) {
    const variant = await this.prisma.productVariant.findFirst({ where: { sku: { equals: sku, mode: 'insensitive' }, product: { storeId } }, select: { id: true, productId: true } });
    const product = variant ? null : await this.prisma.product.findFirst({ where: { storeId, sku: { equals: sku, mode: 'insensitive' }, variants: { none: {} } }, select: { id: true } });
    const productId = variant?.productId ?? product?.id;
    if (!productId) return false;
    const variantId = variant?.id ?? null;
    return this.prisma.$transaction(async tx => {
      const row = await tx.inventory.findFirst({ where: { storeId, productId, variantId } });
      if (!row) return false;
      const target = Math.max(balance, row.reserved);
      if (target === row.quantity) return false;
      await tx.inventory.update({ where: { id: row.id }, data: { quantity: target } });
      await recordMovement(tx, { storeId, productId, variantId, type: StockMovementType.ADJUSTMENT, delta: target - row.quantity, reason: REASON, actorId: 'bling' });
      return true;
    });
  }

  setEnabled(storeId: string, enabled: boolean) {
    return this.prisma.blingConnection.update({ where: { storeId }, data: { stockSyncEnabled: enabled }, select: { stockSyncEnabled: true, stockSyncedAt: true, stockSyncError: true } });
  }
}
