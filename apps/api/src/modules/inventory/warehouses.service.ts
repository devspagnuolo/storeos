import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { recordMovement } from './stock-ledger';
import { adjustTarget, defaultQuantity, Holding, planTransfer, slugCode } from './warehouse-rules';

type InvRow = { id: string; quantity: number; reserved: number };

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Garante o depósito padrão ("Principal") da loja, criando-o na primeira vez. */
  async ensureDefault(storeId: string) {
    const found = await this.prisma.warehouse.findFirst({ where: { storeId, isDefault: true } });
    if (found) return found;
    try {
      return await this.prisma.warehouse.create({ data: { storeId, name: 'Principal', code: 'principal', isDefault: true } });
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      return this.prisma.warehouse.findFirstOrThrow({ where: { storeId, code: 'principal' } });
    }
  }

  async list(storeId: string) {
    await this.ensureDefault(storeId);
    const [warehouses, totals, perWarehouse] = await Promise.all([
      this.prisma.warehouse.findMany({ where: { storeId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] }),
      this.prisma.inventory.aggregate({ where: { storeId }, _sum: { quantity: true } }),
      this.prisma.warehouseStock.groupBy({ by: ['warehouseId'], where: { storeId }, _sum: { quantity: true }, _count: { _all: true } }),
    ]);
    const othersUnits = perWarehouse.reduce((a, r) => a + (r._sum.quantity ?? 0), 0);
    return warehouses.map(w => {
      const row = perWarehouse.find(p => p.warehouseId === w.id);
      return { ...w, units: w.isDefault ? (totals._sum.quantity ?? 0) - othersUnits : row?._sum.quantity ?? 0, skus: row?._count._all ?? 0 };
    });
  }

  async create(storeId: string, name: string) {
    await this.ensureDefault(storeId);
    const code = slugCode(name);
    if (!code) throw new BadRequestException('Informe um nome válido');
    try {
      return await this.prisma.warehouse.create({ data: { storeId, name: name.trim(), code } });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('Já existe um depósito com esse nome');
      throw error;
    }
  }

  async update(storeId: string, id: string, data: { name?: string; active?: boolean }) {
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id, storeId } });
    if (!warehouse) throw new NotFoundException('Depósito não encontrado');
    if (warehouse.isDefault && data.active === false) throw new BadRequestException('O depósito principal não pode ser desativado');
    return this.prisma.warehouse.update({ where: { id }, data: { ...(data.name && { name: data.name.trim() }), ...(data.active !== undefined && { active: data.active }) } });
  }

  async remove(storeId: string, id: string) {
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id, storeId } });
    if (!warehouse) throw new NotFoundException('Depósito não encontrado');
    if (warehouse.isDefault) throw new BadRequestException('O depósito principal não pode ser excluído');
    const left = await this.prisma.warehouseStock.aggregate({ where: { warehouseId: id }, _sum: { quantity: true } });
    if ((left._sum.quantity ?? 0) > 0) throw new BadRequestException('Transfira o estoque deste depósito antes de excluí-lo');
    await this.prisma.warehouse.delete({ where: { id } });
    return { deleted: true };
  }

  /** Saldo de cada item em cada depósito (o padrão é o restante do total). */
  async matrix(storeId: string) {
    const [warehouses, items, stocks] = await Promise.all([
      this.list(storeId),
      this.prisma.inventory.findMany({
        where: { storeId }, take: 5000,
        include: { product: { select: { name: true, sku: true } }, variant: { select: { sku: true, attributes: true } } },
        orderBy: [{ product: { name: 'asc' } }, { variant: { position: 'asc' } }],
      }),
      this.prisma.warehouseStock.findMany({ where: { storeId, quantity: { gt: 0 } } }),
    ]);
    const label = (attrs: unknown) => (Array.isArray(attrs) ? attrs.map((a: { value?: string }) => a.value).join(' / ') : '');
    const def = warehouses.find(w => w.isDefault)!;
    return {
      warehouses: warehouses.map(w => ({ id: w.id, name: w.name, isDefault: w.isDefault, active: w.active })),
      items: items.map(i => {
        const mine = stocks.filter(s => s.inventoryId === i.id);
        const byWarehouse: Record<string, number> = Object.fromEntries(mine.map(s => [s.warehouseId, s.quantity]));
        byWarehouse[def.id] = defaultQuantity(i.quantity, mine.map(s => s.quantity));
        return { productId: i.productId, variantId: i.variantId, name: i.product.name, sku: i.variant?.sku ?? i.product.sku, variation: label(i.variant?.attributes), quantity: i.quantity, reserved: i.reserved, byWarehouse };
      }),
    };
  }

  private async lockInventory(tx: Prisma.TransactionClient, storeId: string, productId: string, variantId: string | null) {
    const rows = await tx.$queryRaw<InvRow[]>(Prisma.sql`SELECT "id", "quantity", "reserved" FROM "Inventory"
      WHERE "storeId" = ${storeId} AND "productId" = ${productId} AND ${variantId ? Prisma.sql`"variantId" = ${variantId}` : Prisma.sql`"variantId" IS NULL`} FOR UPDATE`);
    if (!rows[0]) throw new NotFoundException('Saldo de estoque não encontrado');
    return rows[0];
  }

  private async holdings(tx: Prisma.TransactionClient, storeId: string, inv: InvRow, warehouses: { id: string; isDefault: boolean }[]): Promise<Holding[]> {
    const stocks = await tx.warehouseStock.findMany({ where: { inventoryId: inv.id } });
    const explicit = warehouses.filter(w => !w.isDefault).map(w => ({ id: w.id, isDefault: false, quantity: stocks.find(s => s.warehouseId === w.id)?.quantity ?? 0 }));
    const def = warehouses.find(w => w.isDefault)!;
    return [{ id: def.id, isDefault: true, quantity: defaultQuantity(inv.quantity, explicit.map(e => e.quantity)) }, ...explicit];
  }

  private async setExplicit(tx: Prisma.TransactionClient, storeId: string, warehouseId: string, inventoryId: string, quantity: number) {
    await tx.warehouseStock.upsert({ where: { warehouseId_inventoryId: { warehouseId, inventoryId } }, create: { storeId, warehouseId, inventoryId, quantity }, update: { quantity } });
  }

  private async resolveItem(storeId: string, productId: string, variantId?: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, storeId }, include: { variants: { select: { id: true } } } });
    if (!product) throw new NotFoundException('Produto não encontrado');
    if (product.variants.length && !variantId) throw new BadRequestException('Este produto tem variações: informe qual variação');
    if (variantId && !product.variants.some(v => v.id === variantId)) throw new NotFoundException('Variação não encontrada');
    return { productId: product.id, variantId: variantId ?? null };
  }

  async transfer(storeId: string, actorId: string, input: { productId: string; variantId?: string; fromId: string; toId: string; quantity: number; reason?: string }) {
    await this.ensureDefault(storeId);
    const item = await this.resolveItem(storeId, input.productId, input.variantId);
    const warehouses = await this.prisma.warehouse.findMany({ where: { storeId, active: true } });
    const from = warehouses.find(w => w.id === input.fromId);
    const to = warehouses.find(w => w.id === input.toId);
    if (!from || !to) throw new NotFoundException('Depósito não encontrado ou desativado');
    return this.prisma.$transaction(async tx => {
      const inv = await this.lockInventory(tx, storeId, item.productId, item.variantId);
      const holdings = await this.holdings(tx, storeId, inv, warehouses);
      let plan;
      try { plan = planTransfer(holdings, from.id, to.id, input.quantity); } catch (error) { throw new BadRequestException((error as Error).message); }
      if (!from.isDefault) await this.setExplicit(tx, storeId, from.id, inv.id, plan.fromQuantity);
      if (!to.isDefault) await this.setExplicit(tx, storeId, to.id, inv.id, plan.toQuantity);
      await tx.warehouseTransfer.create({ data: { storeId, ...item, fromWarehouse: from.name, toWarehouse: to.name, quantity: input.quantity, reason: input.reason?.trim() || null, actorId } });
      return { from: { id: from.id, quantity: plan.fromQuantity }, to: { id: to.id, quantity: plan.toQuantity } };
    });
  }

  /** Ajuste manual em um depósito específico; o total da loja acompanha a diferença. */
  async adjust(storeId: string, actorId: string, input: { productId: string; variantId?: string; warehouseId: string; mode: 'DELTA' | 'SET'; quantity: number; reason: string }) {
    await this.ensureDefault(storeId);
    const item = await this.resolveItem(storeId, input.productId, input.variantId);
    const warehouses = await this.prisma.warehouse.findMany({ where: { storeId, active: true } });
    const target = warehouses.find(w => w.id === input.warehouseId);
    if (!target) throw new NotFoundException('Depósito não encontrado ou desativado');
    return this.prisma.$transaction(async tx => {
      const inv = await this.lockInventory(tx, storeId, item.productId, item.variantId);
      const holdings = await this.holdings(tx, storeId, inv, warehouses);
      const current = holdings.find(h => h.id === target.id)!.quantity;
      const next = adjustTarget(current, input.mode, input.quantity);
      if (next < 0) throw new BadRequestException('O saldo do depósito não pode ficar negativo');
      const newTotal = inv.quantity + (next - current);
      if (newTotal < inv.reserved) throw new BadRequestException(`O saldo total não pode ficar abaixo das ${inv.reserved} unidades reservadas em pedidos pendentes`);
      if (newTotal > 1_000_000) throw new BadRequestException('Saldo acima do limite permitido');
      if (!target.isDefault) await this.setExplicit(tx, storeId, target.id, inv.id, next);
      await tx.inventory.update({ where: { id: inv.id }, data: { quantity: newTotal } });
      await recordMovement(tx, { storeId, ...item, type: StockMovementType.ADJUSTMENT, delta: next - current, reason: `${target.name}: ${input.reason.trim()}`, actorId });
      return { warehouseId: target.id, quantity: next, total: newTotal };
    });
  }

  async transfers(storeId: string) {
    return this.prisma.warehouseTransfer.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }
}
