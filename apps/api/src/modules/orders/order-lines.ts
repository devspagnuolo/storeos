import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { Money, money, sumMoney } from '../../shared/money/money';

export type RequestedItem = { productId: string; variantId?: string | null; quantity: number };
export type PricedVariant = { id: string; sku: string; price: Money | string | number | null; attributes: unknown };
export type PricedProduct = { id: string; sku: string; name: string; price: Money | string | number; variants?: PricedVariant[] };
/** `productSku` serve às promoções por SKU do produto; não é gravado no pedido (ver `persistLines`). */
export type OrderLine = { productId: string; variantId?: string; sku: string; name: string; quantity: number; unitPrice: Money; total: Money; productSku: string };

/** Junta itens repetidos (mesmo produto e mesma variação) e rejeita quantidades inválidas. */
export function mergeItems(items: RequestedItem[]): RequestedItem[] {
  const merged = new Map<string, RequestedItem>();
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) throw new BadRequestException('Quantidade inválida');
    const key = `${item.productId}:${item.variantId ?? ''}`;
    const current = merged.get(key);
    if (current) current.quantity += item.quantity;
    else merged.set(key, { productId: item.productId, ...(item.variantId && { variantId: item.variantId }), quantity: item.quantity });
  }
  return [...merged.values()];
}

/** "Preto / G": os valores na ordem cadastrada (guardados como lista porque o jsonb não preserva a ordem de chaves). */
export type VariantAttribute = { name: string; value: string };
export const variantLabel = (attributes: unknown) =>
  Array.isArray(attributes) ? (attributes as VariantAttribute[]).map(a => a.value).join(' / ') : '';

/** Calcula as linhas e o subtotal em Decimal, com preço e SKU vindo sempre do catálogo (da variação, quando houver). */
export function priceOrderLines(items: RequestedItem[], products: PricedProduct[]) {
  const lines: OrderLine[] = items.map(item => {
    const product = products.find(p => p.id === item.productId);
    if (!product) throw new BadRequestException('Produto inválido ou indisponível');
    const hasVariants = Boolean(product.variants?.length);
    if (hasVariants && !item.variantId) throw new BadRequestException(`Escolha uma opção de ${product.name}`);
    if (!hasVariants && item.variantId) throw new BadRequestException('Variação inválida');
    const variant = item.variantId ? product.variants?.find(v => v.id === item.variantId) : undefined;
    if (item.variantId && !variant) throw new BadRequestException('Variação inválida ou indisponível');
    const unitPrice = money((variant?.price ?? product.price).toString());
    const label = variant ? variantLabel(variant.attributes) : '';
    return {
      productId: product.id, ...(variant && { variantId: variant.id }), sku: variant?.sku ?? product.sku, productSku: product.sku,
      name: label ? `${product.name} (${label})` : product.name, quantity: item.quantity, unitPrice, total: unitPrice.times(item.quantity),
    };
  });
  return { lines, subtotal: sumMoney(lines.map(line => line.total)) };
}

/** Remove os campos que não existem na tabela de itens do pedido. */
export const persistLines = (lines: OrderLine[]) => lines.map(({ productSku: _productSku, ...line }) => line);

/** Cláusula SQL do saldo certo: da variação, ou do produto quando ele não tem variações. */
export const inventoryOf = (variantId?: string | null) => (variantId ? Prisma.sql`"variantId" = ${variantId}` : Prisma.sql`"variantId" IS NULL`);

/** Produtos ativos com as variações vigentes, no formato que `priceOrderLines` espera. */
export async function productsForPricing(db: Pick<Prisma.TransactionClient, 'product'>, storeId: string, items: RequestedItem[]) {
  return db.product.findMany({ where: { storeId, id: { in: items.map(i => i.productId) }, status: 'ACTIVE' }, include: { variants: { where: { active: true } } } });
}

/** Número legível e com entropia suficiente para não colidir em pedidos simultâneos. */
export function generateOrderNumber(now = new Date()) {
  const date = now.toISOString().slice(2, 10).replace(/-/g, '');
  return `SO-${date}-${randomBytes(4).toString('hex').toUpperCase()}`;
}
