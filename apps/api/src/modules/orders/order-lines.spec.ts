import { BadRequestException } from '@nestjs/common';
import { formatOrderNumber, mergeItems, priceOrderLines } from './order-lines';

describe('mergeItems', () => {
  it('soma quantidades do mesmo produto', () => {
    expect(mergeItems([{ productId: 'a', quantity: 1 }, { productId: 'b', quantity: 2 }, { productId: 'a', quantity: 3 }])).toEqual([{ productId: 'a', quantity: 4 }, { productId: 'b', quantity: 2 }]);
  });

  it.each([0, -1, 1.5])('rejeita quantidade %p', quantity => {
    expect(() => mergeItems([{ productId: 'a', quantity }])).toThrow(BadRequestException);
  });
});

describe('priceOrderLines', () => {
  const products = [{ id: 'a', sku: 'A', name: 'Produto A', price: '0.10' }, { id: 'b', sku: 'B', name: 'Produto B', price: '19.99' }];

  it('calcula em decimal sem erro de ponto flutuante', () => {
    const { lines, subtotal } = priceOrderLines([{ productId: 'a', quantity: 3 }, { productId: 'b', quantity: 3 }], products);
    expect(lines.map(line => line.total.toFixed(2))).toEqual(['0.30', '59.97']);
    expect(subtotal.toFixed(2)).toBe('60.27');
  });

  it('rejeita produto fora do catálogo', () => {
    expect(() => priceOrderLines([{ productId: 'x', quantity: 1 }], products)).toThrow(BadRequestException);
  });
});

describe('formatOrderNumber', () => {
  it('preenche com zeros até 5 dígitos', () => {
    expect([1, 2, 42, 99999, 100000].map(formatOrderNumber)).toEqual(['00001', '00002', '00042', '99999', '100000']);
  });
});
