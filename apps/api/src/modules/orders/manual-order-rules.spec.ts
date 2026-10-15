import { money } from '../../shared/money/money';
import { applyPriceOverrides, manualTotals, parseMoney } from './manual-order-rules';
import { OrderLine } from './order-lines';

const line = (over: Partial<OrderLine> = {}): OrderLine => ({ productId: 'p1', sku: 'S1', productSku: 'S1', name: 'Blusa', quantity: 2, unitPrice: money('100'), total: money('200'), ...over });

describe('pedido manual', () => {
  it('lê valores em reais e recusa lixo', () => {
    expect(parseMoney('10,5', 'x').toFixed(2)).toBe('10.50');
    expect(parseMoney(7, 'x').toFixed(2)).toBe('7.00');
    for (const bad of ['', '-1', 'abc', '1.234', '1e2']) expect(() => parseMoney(bad, 'x')).toThrow();
  });

  it('aplica preço combinado e recalcula o subtotal', () => {
    const result = applyPriceOverrides([line(), line({ productId: 'p2', name: 'Calça', unitPrice: money('50'), total: money('50'), quantity: 1 })], new Map([['p1:', '90,00']]));
    expect(result.lines[0].unitPrice.toFixed(2)).toBe('90.00');
    expect(result.lines[0].total.toFixed(2)).toBe('180.00');
    expect(result.subtotal.toFixed(2)).toBe('230.00');
    expect(result.changed).toEqual(['Blusa: de R$ 100.00 para R$ 90.00']);
    expect(applyPriceOverrides([line()], new Map([['p1:', '100']])).changed).toEqual([]);
  });

  it('calcula total com desconto e frete', () => {
    expect(manualTotals(money('200'), '20', '15,90').total.toFixed(2)).toBe('195.90');
    expect(manualTotals(money('200'), undefined, undefined).total.toFixed(2)).toBe('200.00');
    expect(() => manualTotals(money('200'), '200.01', 0)).toThrow(/desconto/);
  });
});
