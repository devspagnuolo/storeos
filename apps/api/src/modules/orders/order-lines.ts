import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Money, money, sumMoney } from '../../shared/money/money';

export type RequestedItem = { productId: string; quantity: number };
export type PricedProduct = { id: string; sku: string; name: string; price: Money | string | number };
export type OrderLine = { productId: string; sku: string; name: string; quantity: number; unitPrice: Money; total: Money };

/** Junta itens repetidos do mesmo produto e rejeita quantidades inválidas. */
export function mergeItems(items: RequestedItem[]): RequestedItem[] {
  const quantities = new Map<string, number>();
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) throw new BadRequestException('Quantidade inválida');
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }
  return [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
}

/** Calcula as linhas e o subtotal em Decimal, com o preço vindo sempre do catálogo. */
export function priceOrderLines(items: RequestedItem[], products: PricedProduct[]) {
  const lines: OrderLine[] = items.map(item => {
    const product = products.find(p => p.id === item.productId);
    if (!product) throw new BadRequestException('Produto inválido ou indisponível');
    const unitPrice = money(product.price.toString());
    return { productId: product.id, sku: product.sku, name: product.name, quantity: item.quantity, unitPrice, total: unitPrice.times(item.quantity) };
  });
  return { lines, subtotal: sumMoney(lines.map(line => line.total)) };
}

/** Número legível e com entropia suficiente para não colidir em pedidos simultâneos. */
export function generateOrderNumber(now = new Date()) {
  const date = now.toISOString().slice(2, 10).replace(/-/g, '');
  return `SO-${date}-${randomBytes(4).toString('hex').toUpperCase()}`;
}
