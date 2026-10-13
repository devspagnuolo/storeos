import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { fromCents, toCents } from '../../../shared/domain/money';
import { slugify } from '../../../shared/domain/slug';
import { EncryptionService } from '../../../shared/infrastructure/crypto/encryption.service';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { InventoryService } from '../../inventory/application/inventory.service';
import { OrdersService } from '../../orders/application/orders.service';
import { ErpCredentials, ErpOrderStatus, ErpProduct, ErpProvider } from '../providers/erp-provider';
import { IntegrationsService } from './integrations.service';

interface Ctx {
  integrationId: string;
  storeId: string;
  provider: ErpProvider;
  credentials: ErpCredentials;
  config: Record<string, unknown>;
}

const FLOW = ['PAID', 'PICKING', 'INVOICED', 'SHIPPED', 'DELIVERED'] as const;

/** Casos de uso de sincronização com o ERP (agnósticos de fornecedor). */
@Injectable()
export class ErpSyncService {
  private readonly logger = new Logger(ErpSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    private readonly inventory: InventoryService,
    private readonly orders: OrdersService,
    private readonly crypto: EncryptionService,
  ) {}

  private async context(integrationId: string): Promise<Ctx> {
    const { credentials, provider, config, storeId } = await this.integrations.freshCredentials(integrationId);
    return { integrationId, storeId, provider, credentials, config };
  }

  /** Executa um job da fila. Lança em caso de falha (o worker agenda nova tentativa). */
  async run(job: { id: string; integrationId: string; storeId: string; type: string; payload: unknown }): Promise<Record<string, unknown>> {
    const ctx = await this.context(job.integrationId);
    const payload = (job.payload ?? {}) as Record<string, unknown>;
    const log = <T>(op: string, dir: 'INBOUND' | 'OUTBOUND', fn: () => Promise<T>) => this.integrations.logged(ctx.integrationId, ctx.storeId, op, dir, fn, payload);

    switch (job.type) {
      case 'IMPORT_PRODUCTS':
        return log('import-products', 'INBOUND', () => this.importProducts(ctx, Number(payload.page ?? 1)));
      case 'IMPORT_STOCK':
        return log('import-stock', 'INBOUND', () => this.importStock(ctx));
      case 'IMPORT_CUSTOMERS':
        return log('import-customers', 'INBOUND', () => this.importCustomers(ctx, Number(payload.page ?? 1)));
      case 'EXPORT_ORDER':
        return log('export-order', 'OUTBOUND', () => this.exportOrder(ctx, String(payload.orderId)));
      case 'REFRESH_ORDER_STATUS':
        return log('refresh-order-status', 'INBOUND', () => this.refreshOrder(ctx, String(payload.orderId)));
      default:
        throw new Error(`Tipo de job desconhecido: ${job.type}`);
    }
  }

  // ── Produtos ──

  async importProducts(ctx: Ctx, page: number): Promise<Record<string, unknown>> {
    const result = await ctx.provider.listProducts(ctx.credentials, page);
    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const item of result.items) {
      const outcome = await this.upsertProduct(ctx, item);
      if (outcome === 'created') created += 1;
      else if (outcome === 'updated') updated += 1;
      else skipped += 1;
    }
    if (result.nextPage) {
      await this.integrations.enqueue(ctx.storeId, ctx.integrationId, 'IMPORT_PRODUCTS', { page: result.nextPage }, { dedupeKey: `import-products:${result.nextPage}` });
    } else {
      await this.prisma.integration.update({ where: { id: ctx.integrationId }, data: { lastSyncAt: new Date() } });
    }
    return { page, created, updated, skipped, nextPage: result.nextPage };
  }

  private async upsertProduct(ctx: Ctx, item: ErpProduct): Promise<'created' | 'updated' | 'skipped'> {
    const { storeId, integrationId } = ctx;
    const importPrices = ctx.config.importPrices !== false;
    const importStock = ctx.config.importStock !== false;
    const hash = createHash('sha256').update(JSON.stringify([item.sku, item.name, item.priceCents, item.active, item.stock, item.description, item.imageUrls])).digest('hex');

    const mapping = await this.prisma.externalMapping.findUnique({ where: { integrationId_entityType_externalId: { integrationId, entityType: 'VARIANT', externalId: item.externalId } } });
    if (mapping?.contentHash === hash) return 'skipped';

    if (item.parentExternalId) return this.upsertVariation(ctx, item, hash, importPrices, importStock);

    let variantId = mapping?.internalId;
    let outcome: 'created' | 'updated' = 'updated';
    if (!variantId) {
      const bySku = await this.prisma.productVariant.findFirst({ where: { sku: item.sku, product: { storeId, deletedAt: null } } });
      if (bySku) variantId = bySku.id;
    }

    if (!variantId) {
      const slug = await this.uniqueSlug(storeId, item.name);
      const brandId = item.brandName ? await this.brand(storeId, item.brandName) : undefined;
      const product = await this.prisma.product.create({
        data: {
          storeId,
          name: item.name,
          slug,
          sku: item.sku,
          description: item.description,
          price: fromCents(item.priceCents),
          ean: item.ean,
          ncm: item.ncm,
          weightGrams: item.weightGrams ?? 0,
          widthMm: item.widthMm ?? 0,
          heightMm: item.heightMm ?? 0,
          lengthMm: item.lengthMm ?? 0,
          brandId,
          status: item.active && ctx.config.autoPublish === true ? 'ACTIVE' : 'DRAFT',
          publishedAt: item.active && ctx.config.autoPublish === true ? new Date() : null,
          media: { create: item.imageUrls.slice(0, 10).map((url, position) => ({ kind: 'IMAGE' as const, url, position, isCover: position === 0, alt: item.name })) },
          variants: { create: { sku: item.sku, ean: item.ean, attributes: {}, isDefault: true } },
        },
        include: { variants: true },
      });
      variantId = product.variants[0].id;
      await this.map(ctx, 'PRODUCT', product.id, item.externalId, item.sku, hash);
      outcome = 'created';
    } else {
      const variant = await this.prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
      const data: Record<string, unknown> = {};
      if (importPrices) data.price = fromCents(item.priceCents);
      if (ctx.config.overwriteContent === true) Object.assign(data, { name: item.name, description: item.description });
      if (Object.keys(data).length) await this.prisma.product.update({ where: { id: variant.productId }, data });
      if (!item.active) await this.prisma.product.updateMany({ where: { id: variant.productId, status: 'ACTIVE' }, data: { status: 'ARCHIVED' } });
      await this.map(ctx, 'PRODUCT', variant.productId, item.externalId, item.sku, hash);
    }

    await this.map(ctx, 'VARIANT', variantId, item.externalId, item.sku, hash);
    if (importStock && item.stock !== undefined) await this.inventory.setOnHand(storeId, variantId, Math.max(0, Math.floor(item.stock)), 'Sincronização ERP');
    return outcome;
  }

  private async upsertVariation(ctx: Ctx, item: ErpProduct, hash: string, importPrices: boolean, importStock: boolean): Promise<'created' | 'updated' | 'skipped'> {
    const { storeId, integrationId } = ctx;
    const parentMap = await this.prisma.externalMapping.findUnique({ where: { integrationId_entityType_externalId: { integrationId, entityType: 'PRODUCT', externalId: item.parentExternalId as string } } });
    if (!parentMap) return 'skipped';
    const existing = await this.prisma.productVariant.findFirst({ where: { productId: parentMap.internalId, sku: item.sku } });
    let variantId = existing?.id;
    let outcome: 'created' | 'updated' = 'updated';
    if (!variantId) {
      const count = await this.prisma.productVariant.count({ where: { productId: parentMap.internalId } });
      const created = await this.prisma.productVariant.create({
        data: { productId: parentMap.internalId, sku: item.sku, price: fromCents(item.priceCents), attributes: { Variação: item.name.replace(/^.*?\s-\s/, '') }, position: count },
      });
      variantId = created.id;
      await this.prisma.productVariant.updateMany({ where: { productId: parentMap.internalId, isDefault: true }, data: { active: false } });
      await this.prisma.product.update({ where: { id: parentMap.internalId }, data: { type: 'VARIABLE' } });
      outcome = 'created';
    } else if (importPrices) {
      await this.prisma.productVariant.update({ where: { id: variantId }, data: { price: fromCents(item.priceCents) } });
    }
    await this.map(ctx, 'VARIANT', variantId, item.externalId, item.sku, hash);
    if (importStock && item.stock !== undefined) await this.inventory.setOnHand(storeId, variantId, Math.max(0, Math.floor(item.stock)), 'Sincronização ERP');
    return outcome;
  }

  // ── Estoque ──

  async importStock(ctx: Ctx): Promise<Record<string, unknown>> {
    const maps = await this.prisma.externalMapping.findMany({ where: { integrationId: ctx.integrationId, entityType: 'VARIANT' }, select: { internalId: true, externalId: true } });
    if (!maps.length) return { updated: 0 };
    const byExternal = new Map(maps.map((m) => [m.externalId, m.internalId]));
    const stocks = await ctx.provider.listStock(ctx.credentials, maps.map((m) => m.externalId), (ctx.config.stockWarehouseId as string | undefined) || undefined);
    let updated = 0;
    for (const s of stocks) {
      const variantId = byExternal.get(s.externalId);
      if (!variantId) continue;
      await this.inventory.setOnHand(ctx.storeId, variantId, s.quantity, 'Sincronização ERP');
      updated += 1;
    }
    await this.prisma.integration.update({ where: { id: ctx.integrationId }, data: { lastSyncAt: new Date() } });
    return { updated };
  }

  // ── Clientes ──

  async importCustomers(ctx: Ctx, page: number): Promise<Record<string, unknown>> {
    const result = await ctx.provider.listCustomers(ctx.credentials, page);
    let created = 0;
    for (const c of result.items) {
      if (!c.email) continue;
      const email = c.email.toLowerCase();
      const exists = await this.prisma.customer.findUnique({ where: { storeId_email: { storeId: ctx.storeId, email } } });
      if (exists) continue;
      const customer = await this.prisma.customer.create({
        data: { storeId: ctx.storeId, email, name: c.name, phone: c.phone, source: 'ERP', documentEnc: c.document ? this.crypto.encrypt(c.document) : undefined, documentHash: c.document ? this.crypto.searchHash(c.document) : undefined },
      });
      await this.map(ctx, 'CUSTOMER', customer.id, c.externalId, undefined, undefined);
      created += 1;
    }
    if (result.nextPage) await this.integrations.enqueue(ctx.storeId, ctx.integrationId, 'IMPORT_CUSTOMERS', { page: result.nextPage }, { dedupeKey: `import-customers:${result.nextPage}` });
    return { page, created, nextPage: result.nextPage };
  }

  // ── Pedidos ──

  async exportOrder(ctx: Ctx, orderId: string): Promise<Record<string, unknown>> {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, storeId: ctx.storeId }, include: { items: true, payments: { take: 1, orderBy: { createdAt: 'asc' } } } });
    if (!order) throw new Error(`Pedido ${orderId} não encontrado`);
    if (order.erpOrderId) return { skipped: true, erpOrderId: order.erpOrderId }; // idempotente
    if (!['PAID', 'PICKING', 'INVOICED', 'SHIPPED', 'DELIVERED'].includes(order.status)) return { skipped: true, reason: `status ${order.status}` };

    const addr = order.shippingAddress as Record<string, string>;
    const document = order.customerDocumentEnc ? this.crypto.decrypt(order.customerDocumentEnc) : undefined;
    const result = await ctx.provider.createOrder(
      ctx.credentials,
      {
        number: order.number,
        placedAt: order.placedAt,
        customer: { name: order.customerName, email: order.customerEmail, phone: order.customerPhone ?? undefined, document },
        shippingAddress: { street: addr.street, number: addr.number, complement: addr.complement, district: addr.district, city: addr.city, state: addr.state, zipCode: addr.zipCode },
        lines: order.items.map((i) => ({ sku: i.sku, name: i.name, quantity: i.quantity, unitPriceCents: toCents(i.unitPrice) - Math.round(toCents(i.discount) / Math.max(1, i.quantity)) })),
        shippingCents: toCents(order.shippingTotal),
        discountCents: 0,
        totalCents: toCents(order.total),
        notes: order.notes ?? undefined,
        paymentMethod: order.payments[0]?.method ?? 'N/A',
      },
      ctx.config,
    );
    await this.prisma.order.update({ where: { id: order.id }, data: { erpProvider: ctx.provider.key, erpOrderId: result.externalId, erpSyncStatus: 'SYNCED' } });
    await this.map(ctx, 'ORDER', order.id, result.externalId, result.externalNumber, undefined);
    await this.orders.addTimeline(this.prisma, order.id, { type: 'INTEGRATION', message: `Pedido enviado ao ${ctx.provider.key.toUpperCase()} (#${result.externalId})` });
    await this.integrations.enqueue(ctx.storeId, ctx.integrationId, 'REFRESH_ORDER_STATUS', { orderId: order.id }, { dedupeKey: `refresh:${order.id}`, delaySeconds: 120 });
    return { erpOrderId: result.externalId };
  }

  async refreshOrder(ctx: Ctx, orderId: string): Promise<Record<string, unknown>> {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, storeId: ctx.storeId } });
    if (!order?.erpOrderId) return { skipped: true };
    const status = await ctx.provider.getOrderStatus(ctx.credentials, order.erpOrderId, ctx.config);
    if (!status) return { skipped: true, reason: 'pedido não encontrado no ERP' };
    await this.applyErpStatus(ctx.storeId, order.id, status);
    return { applied: true, erpStatus: status.statusId ?? null };
  }

  /** Reflete no pedido o que o ERP já fez (NF-e, rastreio, etapa). Nunca regride status. */
  async applyErpStatus(storeId: string, orderId: string, status: ErpOrderStatus): Promise<void> {
    if (status.invoice?.number) await this.orders.attachInvoice(storeId, orderId, status.invoice);
    if (status.trackingCode) {
      await this.prisma.order.updateMany({ where: { id: orderId, storeId }, data: { trackingCode: status.trackingCode, carrier: status.carrier } });
    }

    let target: (typeof FLOW)[number] | null = null;
    if (status.trackingCode) target = 'SHIPPED';
    else if (status.invoice?.number) target = 'INVOICED';
    else if (status.mapped === 'PICKING' || status.mapped === 'INVOICED' || status.mapped === 'SHIPPED' || status.mapped === 'DELIVERED') target = status.mapped;

    if (status.mapped === 'CANCELLED') {
      await this.prisma.order.update({ where: { id: orderId }, data: { erpSyncStatus: 'ERP_CANCELLED' } });
      await this.orders.addNote(storeId, orderId, 'Pedido cancelado no ERP — revisar e, se necessário, estornar manualmente', false);
      return;
    }
    if (!target) return;

    const order = await this.prisma.order.findFirstOrThrow({ where: { id: orderId, storeId } });
    const from = FLOW.indexOf(order.status as (typeof FLOW)[number]);
    const to = FLOW.indexOf(target);
    if (from < 0 || to <= from) return;
    // Percorre as etapas intermediárias (silenciosas) até a alvo, respeitando a máquina de estados.
    await this.prisma.runInTransaction(async (tx) => {
      for (let i = from + 1; i <= to; i += 1) {
        const step = FLOW[i];
        const last = i === to;
        try {
          await this.orders.transition(tx, storeId, orderId, step, { silent: !last, trackingCode: last ? status.trackingCode : undefined, carrier: last ? status.carrier : undefined });
        } catch (err) {
          if ((err as { code?: string }).code === 'INVALID_ORDER_TRANSITION') continue;
          throw err;
        }
      }
    });
  }

  /** Webhook do ERP: reconsulta o recurso e aplica. */
  async handleErpEvent(integrationId: string, resource: string | undefined, externalId: string | undefined): Promise<void> {
    if (!externalId) return;
    if (resource === 'order' || resource === 'invoice') {
      const order = await this.prisma.order.findFirst({ where: { erpOrderId: externalId } });
      if (order) await this.integrations.enqueue(order.storeId, integrationId, 'REFRESH_ORDER_STATUS', { orderId: order.id }, { dedupeKey: `refresh:${order.id}` });
    } else if (resource === 'stock' || resource === 'product') {
      const integration = await this.prisma.integration.findUniqueOrThrow({ where: { id: integrationId } });
      await this.integrations.enqueue(integration.storeId, integrationId, 'IMPORT_STOCK', {}, { dedupeKey: 'import-stock' });
    }
  }

  // ── helpers ──

  private async map(ctx: Ctx, entityType: 'PRODUCT' | 'VARIANT' | 'CUSTOMER' | 'ORDER', internalId: string, externalId: string, externalCode: string | undefined, contentHash: string | undefined) {
    await this.prisma.externalMapping.upsert({
      where: { integrationId_entityType_externalId: { integrationId: ctx.integrationId, entityType, externalId } },
      create: { storeId: ctx.storeId, integrationId: ctx.integrationId, entityType, internalId, externalId, externalCode, contentHash },
      update: { internalId, externalCode, contentHash, syncedAt: new Date() },
    }).catch((err) => this.logger.warn(`Mapeamento ${entityType}/${externalId} ignorado: ${(err as Error).message}`));
  }

  private async uniqueSlug(storeId: string, name: string): Promise<string> {
    const base = slugify(name) || 'produto';
    const taken = await this.prisma.product.count({ where: { storeId, slug: { startsWith: base } } });
    return taken ? `${base}-${taken + 1}` : base;
  }

  private async brand(storeId: string, name: string): Promise<string> {
    const found = await this.prisma.brand.findFirst({ where: { storeId, name: { equals: name, mode: 'insensitive' } } });
    if (found) return found.id;
    const base = slugify(name) || 'marca';
    const taken = await this.prisma.brand.count({ where: { storeId, slug: { startsWith: base } } });
    return (await this.prisma.brand.create({ data: { storeId, name, slug: taken ? `${base}-${taken + 1}` : base } })).id;
  }
}
