import { describe, expect, it } from 'vitest';
import { stockIssue, stockMessage } from './availability';

const item = { productId: 'p1', slug: 'vaso', name: 'Vaso', price: '10.00', quantity: 3 };
const info = (available: number, active = true) => ({ productId: 'p1', variantId: null, active, available, price: '10.00' });

describe('estoque do carrinho', () => {
  it('sem consulta não acusa nada', () => expect(stockIssue(item)).toBeNull());
  it('dentro do saldo está ok', () => expect(stockIssue(item, info(3))).toBeNull());
  it('acima do saldo informa quantas unidades há', () => {
    const issue = stockIssue(item, info(2));
    expect(issue).toEqual({ kind: 'over', available: 2 });
    expect(stockMessage(issue!)).toBe('Temos só 2 unidades disponíveis. Ajuste a quantidade.');
    expect(stockMessage({ kind: 'over', available: 1 })).toMatch(/1 unidade disponível/);
  });
  it('esgotado ou fora de venda pede para remover', () => {
    expect(stockIssue(item, info(0))).toEqual({ kind: 'unavailable' });
    expect(stockIssue(item, info(5, false))).toEqual({ kind: 'unavailable' });
  });
});
