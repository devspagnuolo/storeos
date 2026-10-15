import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus, StockMovementType } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { recordMovement, toCsv } from './stock-ledger';

export type AdjustInput = { productId: string; variantId?: string; mode: 'DELTA' | 'SET'; quantity: number; reason: string };
type Row = { id: string; quantity: number; reserved: number };

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ajuste manual (entrada, perda, contagem). O saldo físico nunca fica abaixo do reservado. */
  async adjust(storeId: string, actorId: string, input: AdjustInput) {
    const product = await this.prisma.product.findFirst({ where: { id: input.productId, storeId }, include: { variants: { select: { id: true } } } });
    if (!product) throw new NotFoundException('Produto não encontrado');
    if (product.variants.length && !input.variantId) throw new BadRequestException('Este produto tem variações: informe qual variação ajustar');
    if (!product.variants.length && input.variantId) throw new BadRequestException('Este produto não tem variações');
    if (input.variantId && !product.variants.some(v => v.id === input.variantId)) throw new NotFoundException('Variação não encontrada');
    const variantId = input.variantId ?? null;
    return this.prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<Row[]>(Prisma.sql`SELECT "id", "quantity", "reserved" FROM "Inventory"
        WHERE "storeId" = ${storeId} AND "productId" = ${product.id} AND ${variantId ? Prisma.sql`"variantId" = ${variantId}` : Prisma.sql`"variantId" IS NULL`} FOR UPDATE`);
      const row = rows[0];
      if (!row) throw new NotFoundException('Saldo de estoque não encontrado');
      const target = input.mode === 'SET' ? input.quantity : row.quantity + input.quantity;
      const others = await tx.warehouseStock.aggregate({ where: { inventoryId: row.id }, _sum: { quantity: true } });
      if (target < (others._sum.quantity ?? 0)) throw new BadRequestException(`O saldo total não pode ficar abaixo das ${others._sum.quantity} unidades guardadas em outros depósitos`);
      if (target < row.reserved) throw new BadRequestException(`O saldo não pode ficar abaixo das ${row.reserved} unidades reservadas em pedidos pendentes`);
      if (target > 1_000_000) throw new BadRequestException('Saldo acima do limite permitido');
      await tx.inventory.update({ where: { id: row.id }, data: { quantity: target } });
      await recordMovement(tx, { storeId, productId: product.id, variantId, type: StockMovementType.ADJUSTMENT, delta: target - row.quantity, reason: input.reason.trim(), actorId });
      return { productId: product.id, variantId, quantity: target, reserved: row.reserved, available: target - row.reserved };
    });
  }

  async movements(storeId: string, { productId, type, page = 1, pageSize = 30 }: { productId?: string; type?: StockMovementType; page?: number; pageSize?: number }) {
    const where: Prisma.StockMovementWhereInput = { storeId, ...(productId && { productId }), ...(type && { type }) };
    const [rows, total] = await Promise.all([
      this.prisma.stockMovement.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.stockMovement.count({ where }),
    ]);
    const products = await this.prisma.product.findMany({ where: { storeId, id: { in: [...new Set(rows.map(r => r.productId))] } }, select: { id: true, name: true, sku: true } });
    const variants = await this.prisma.productVariant.findMany({ where: { id: { in: rows.flatMap(r => (r.variantId ? [r.variantId] : [])) } }, select: { id: true, sku: true } });
    return {
      items: rows.map(r => ({ ...r, productName: products.find(p => p.id === r.productId)?.name ?? null, sku: variants.find(v => v.id === r.variantId)?.sku ?? products.find(p => p.id === r.productId)?.sku ?? null })),
      total, page, pageSize,
    };
  }

  /** Itens ativos com saldo disponível (físico menos reservado) igual ou abaixo do limite, os mais críticos primeiro. */
  async lowStock(storeId: string, threshold = 5) {
    const rows = await this.prisma.inventory.findMany({
      where: { storeId, product: { status: ProductStatus.ACTIVE } },
      include: { product: { select: { name: true, sku: true, _count: { select: { variants: true } } } }, variant: { select: { sku: true, attributes: true, active: true } } },
    });
    return rows
      .filter(r => (r.product._count.variants ? r.variant?.active : !r.variantId))
      .map(r => ({ productId: r.productId, variantId: r.variantId, name: r.product.name, sku: r.variant?.sku ?? r.product.sku, attributes: r.variant?.attributes ?? null, quantity: r.quantity, reserved: r.reserved, available: r.quantity - r.reserved }))
      .filter(r => r.available <= Math.max(threshold, 0))
      .sort((a, b) => a.available - b.available || a.name.localeCompare(b.name))
      .slice(0, 500);
  }

  /** Todos os saldos da loja (um por produto ou por variação), em ordem alfabética. */
  async items(storeId: string) {
    const rows = await this.prisma.inventory.findMany({
      where: { storeId },
      include: { product: { select: { name: true, sku: true, price: true, status: true } }, variant: { select: { sku: true, price: true, attributes: true } } },
      orderBy: [{ product: { name: 'asc' } }, { variant: { position: 'asc' } }],
      take: 5000,
    });
    const label = (attrs: unknown) => (Array.isArray(attrs) ? attrs.map((a: { value?: string }) => a.value).join(' / ') : '');
    return rows.map(r => ({
      productId: r.productId, variantId: r.variantId, name: r.product.name, sku: r.variant?.sku ?? r.product.sku, variation: label(r.variant?.attributes),
      status: r.product.status, price: (r.variant?.price ?? r.product.price).toString(), quantity: r.quantity, reserved: r.reserved, available: r.quantity - r.reserved,
    }));
  }

  async exportCsv(storeId: string) {
    return toCsv([
      ['SKU', 'Produto', 'Variação', 'Status', 'Preço', 'Físico', 'Reservado', 'Disponível'],
      ...(await this.items(storeId)).map(r => [r.sku, r.name, r.variation, r.status, r.price, r.quantity, r.reserved, r.available]),
    ]);
  }
}
