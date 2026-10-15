import { BadRequestException } from '@nestjs/common';
import { Money, money, sumMoney } from '../../shared/money/money';
import { OrderLine } from './order-lines';

const key = (productId: string, variantId?: string | null) => `${productId}:${variantId ?? ''}`;

/** Texto em reais com até 2 casas ("10", "10,5", "10.50"); recusa o resto. */
export function parseMoney(value: unknown, label: string): Money {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new BadRequestException(`${label}: informe um valor em reais com até 2 casas decimais.`);
  return money(text);
}

/** Aplica o preço combinado com o cliente em linhas já calculadas pelo catálogo; devolve também quais linhas mudaram. */
export function applyPriceOverrides(lines: OrderLine[], overrides: Map<string, unknown>) {
  const changed: string[] = [];
  const result = lines.map(line => {
    const raw = overrides.get(key(line.productId, line.variantId));
    if (raw === undefined || raw === null || raw === '') return line;
    const unitPrice = parseMoney(raw, `Preço de ${line.name}`);
    if (unitPrice.equals(line.unitPrice)) return line;
    changed.push(`${line.name}: de R$ ${line.unitPrice.toFixed(2)} para R$ ${unitPrice.toFixed(2)}`);
    return { ...line, unitPrice, total: unitPrice.times(line.quantity) };
  });
  return { lines: result, subtotal: sumMoney(result.map(line => line.total)), changed };
}

/** Total = subtotal − desconto + frete. O desconto nunca passa do subtotal. */
export function manualTotals(subtotal: Money, discountInput: unknown, shippingInput: unknown) {
  const discount = discountInput === undefined || discountInput === null || discountInput === '' ? money(0) : parseMoney(discountInput, 'Desconto');
  const shipping = shippingInput === undefined || shippingInput === null || shippingInput === '' ? money(0) : parseMoney(shippingInput, 'Frete');
  if (discount.gt(subtotal)) throw new BadRequestException('O desconto não pode ser maior que o valor dos itens.');
  return { discount, shipping, total: subtotal.minus(discount).plus(shipping) };
}

export const itemKey = key;
