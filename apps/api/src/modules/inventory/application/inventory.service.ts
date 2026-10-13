import { Injectable } from '@nestjs/common';
import { EventNames } from '@storeos/contracts';
import { BusinessRuleError, NotFoundError } from '../../../shared/domain/errors';
import { AuditService } from '../../../shared/infrastructure/audit/audit.service';
import { OutboxService } from '../../../shared/infrastructure/outbox/outbox.service';
import { PrismaService, Tx } from '../../../shared/infrastructure/prisma/prisma.service';

export interface StockLine {
  variantId: string;
  quantity: number;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async defaultWarehouseId(storeId: string, client: PrismaService | Tx = this.prisma): Promise<string> {
    const wh =
      (await client.warehouse.findFirst({ where: { storeId, isDefault: true, active: true } })) ??
      (await client.warehouse.findFirst({ where: { storeId, active: true } }));
    if (!wh) throw new BusinessRuleError('Loja sem depósito ativo', 'NO_WAREHOUSE');
    return wh.id;
  }

  /** Quantidade vendável por variante (somando depósitos ativos). Variantes sem controle de estoque não entram. */
  async availability(storeId: string, variantIds: string[]): Promise<Map<string, number>> {
    if (!variantIds.length) return new Map();
    const rows = await this.prisma.inventoryLevel.groupBy({
      by: ['variantId'],
      where: { storeId, variantId: { in: variantIds }, warehouse: { active: true } },
      _sum: { onHand: true, reserved: true },
    });
    return new Map(rows.map((r) => [r.variantId, Math.max(0, (r._sum.onHand ?? 0) - (r._sum.reserved ?? 0))]));
  }

  /** Define/ajusta estoque. `delta` positivo entra, negativo sai. Movimentação sempre registrada. */
  async adjust(
    storeId: string,
    input: { variantId: string; warehouseId?: string; delta: number; reason: string; type?: 'RECEIPT' | 'ADJUSTMENT' | 'ERP_SYNC' | 'RETURN'; referenceType?: string; referenceId?: string },
    actorId?: string,
    tx?: Tx,
  ): Promise<{ onHand: number; reserved: number }> {
    const run = async (client: Tx) => {
      const variant = await client.productVariant.findFirst({ where: { id: input.variantId, product: { storeId } } });
      if (!variant) throw new NotFoundError('Variante não encontrada', 'VARIANT_NOT_FOUND');
      const warehouseId = input.warehouseId ?? (await this.defaultWarehouseId(storeId, client));

      await client.inventoryLevel.upsert({
        where: { warehouseId_variantId: { warehouseId, variantId: input.variantId } },
        create: { storeId, warehouseId, variantId: input.variantId, onHand: 0 },
        update: {},
      });
      // UPDATE atômico impede saldo negativo mesmo com concorrência.
      const updated = await client.$queryRaw<{ onHand: number; reserved: number }[]>`
        UPDATE "InventoryLevel"
           SET "onHand" = "onHand" + ${input.delta}, "updatedAt" = now()
         WHERE "warehouseId" = ${warehouseId} AND "variantId" = ${input.variantId}
           AND "onHand" + ${input.delta} >= "reserved"
        RETURNING "onHand", "reserved"`;
      if (!updated.length) throw new BusinessRuleError('Ajuste deixaria o estoque abaixo do reservado', 'INSUFFICIENT_STOCK');
      const level = updated[0];
      await client.stockMovement.create({
        data: {
          storeId,
          warehouseId,
          variantId: input.variantId,
          type: input.type ?? 'ADJUSTMENT',
          quantity: input.delta,
          balanceAfter: level.onHand,
          reason: input.reason,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          actorId,
        },
      });
      await this.outbox.enqueue(client, {
        storeId,
        aggregateType: 'ProductVariant',
        aggregateId: input.variantId,
        eventName: EventNames.INVENTORY_ADJUSTED,
        payload: { variantId: input.variantId, onHand: level.onHand, delta: input.delta },
      });
      return level;
    };
    const result = tx ? await run(tx) : await this.prisma.runInTransaction(run);
    if (!tx) await this.audit.record({ storeId, action: 'inventory.adjusted', entityType: 'ProductVariant', entityId: input.variantId, after: { delta: input.delta, reason: input.reason }, actorId });
    return result;
  }

  /** Define o saldo absoluto (usado por sincronização de ERP). */
  async setOnHand(storeId: string, variantId: string, onHand: number, reason: string, tx?: Tx): Promise<void> {
    const client = tx ?? this.prisma;
    const warehouseId = await this.defaultWarehouseId(storeId, client);
    const level = await client.inventoryLevel.findUnique({ where: { warehouseId_variantId: { warehouseId, variantId } } });
    const current = level?.onHand ?? 0;
    const reserved = level?.reserved ?? 0;
    const target = Math.max(onHand, reserved);
    if (target === current) return;
    await this.adjust(storeId, { variantId, warehouseId, delta: target - current, reason, type: 'ERP_SYNC' }, undefined, tx);
  }

  /**
   * Reserva atômica para um pedido. Falha inteira (todas as linhas) se qualquer item não tiver saldo.
   * Deve ser chamada dentro da transação de criação do pedido.
   */
  async reserve(tx: Tx, storeId: string, lines: StockLine[], reference: { type: string; id: string }, ttlMinutes: number | null): Promise<void> {
    const warehouseId = await this.defaultWarehouseId(storeId, tx);
    const sorted = [...lines].sort((a, b) => a.variantId.localeCompare(b.variantId)); // ordem estável evita deadlock
    for (const line of sorted) {
      const variant = await tx.productVariant.findFirst({ where: { id: line.variantId, product: { storeId } }, include: { product: true } });
      if (!variant) throw new NotFoundError('Produto indisponível', 'VARIANT_NOT_FOUND');
      if (!variant.product.trackInventory) continue;

      const updated = variant.product.allowBackorder
        ? await tx.$executeRaw`UPDATE "InventoryLevel" SET "reserved" = "reserved" + ${line.quantity}, "updatedAt" = now()
                                WHERE "warehouseId" = ${warehouseId} AND "variantId" = ${line.variantId}`
        : await tx.$executeRaw`UPDATE "InventoryLevel" SET "reserved" = "reserved" + ${line.quantity}, "updatedAt" = now()
                                WHERE "warehouseId" = ${warehouseId} AND "variantId" = ${line.variantId}
                                  AND "onHand" - "reserved" >= ${line.quantity}`;
      if (updated === 0) {
        throw new BusinessRuleError(`Estoque insuficiente para ${variant.sku}`, 'INSUFFICIENT_STOCK');
      }
      await tx.stockReservation.create({
        data: {
          storeId,
          warehouseId,
          variantId: line.variantId,
          quantity: line.quantity,
          referenceType: reference.type,
          referenceId: reference.id,
          expiresAt: ttlMinutes ? new Date(Date.now() + ttlMinutes * 60_000) : null,
        },
      });
    }
  }

  /** Pagamento confirmado: baixa definitiva (onHand e reserved diminuem). */
  async commit(tx: Tx, storeId: string, reference: { type: string; id: string }): Promise<void> {
    const reservations = await tx.stockReservation.findMany({ where: { storeId, referenceType: reference.type, referenceId: reference.id, status: 'ACTIVE' } });
    for (const r of reservations) {
      const rows = await tx.$queryRaw<{ onHand: number }[]>`
        UPDATE "InventoryLevel" SET "onHand" = "onHand" - ${r.quantity}, "reserved" = GREATEST("reserved" - ${r.quantity}, 0), "updatedAt" = now()
         WHERE "warehouseId" = ${r.warehouseId} AND "variantId" = ${r.variantId} RETURNING "onHand"`;
      await tx.stockReservation.update({ where: { id: r.id }, data: { status: 'COMMITTED' } });
      await tx.stockMovement.create({
        data: {
          storeId,
          warehouseId: r.warehouseId,
          variantId: r.variantId,
          type: 'SALE',
          quantity: -r.quantity,
          balanceAfter: rows[0]?.onHand ?? 0,
          referenceType: reference.type,
          referenceId: reference.id,
        },
      });
    }
  }

  /** Pedido cancelado/expirado: libera reservas ativas. */
  async release(tx: Tx, storeId: string, reference: { type: string; id: string }, status: 'RELEASED' | 'EXPIRED' = 'RELEASED'): Promise<number> {
    const reservations = await tx.stockReservation.findMany({ where: { storeId, referenceType: reference.type, referenceId: reference.id, status: 'ACTIVE' } });
    for (const r of reservations) {
      await tx.$executeRaw`UPDATE "InventoryLevel" SET "reserved" = GREATEST("reserved" - ${r.quantity}, 0), "updatedAt" = now()
                           WHERE "warehouseId" = ${r.warehouseId} AND "variantId" = ${r.variantId}`;
      await tx.stockReservation.update({ where: { id: r.id }, data: { status } });
    }
    return reservations.length;
  }

  /** Devolução de itens já baixados ao estoque. */
  async restock(tx: Tx, storeId: string, lines: StockLine[], reference: { type: string; id: string }, reason: string): Promise<void> {
    for (const line of lines) {
      await this.adjust(storeId, { variantId: line.variantId, delta: line.quantity, reason, type: 'RETURN', referenceType: reference.type, referenceId: reference.id }, undefined, tx);
    }
  }

  async movements(storeId: string, variantId: string, take = 50) {
    return this.prisma.stockMovement.findMany({ where: { storeId, variantId }, orderBy: { createdAt: 'desc' }, take });
  }

  async lowStock(storeId: string, take = 50) {
    return this.prisma.$queryRaw<{ variantId: string; sku: string; name: string; available: number; reorderPoint: number }[]>`
      SELECT l."variantId", v.sku, p.name, (l."onHand" - l."reserved") AS available, l."reorderPoint"
        FROM "InventoryLevel" l
        JOIN "ProductVariant" v ON v.id = l."variantId"
        JOIN "Product" p ON p.id = v."productId"
       WHERE l."storeId" = ${storeId} AND p."deletedAt" IS NULL AND (l."onHand" - l."reserved") <= GREATEST(l."reorderPoint", 3)
       ORDER BY available ASC LIMIT ${take}`;
  }
}
