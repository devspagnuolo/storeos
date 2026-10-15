import { money } from '../../shared/money/money';
import { isFullRefund, remainingToRefund, resolveRefundAmount } from './refund-rules';

describe('reembolso', () => {
  it('calcula o restante, contando pendentes e ignorando falhas', () => {
    expect(remainingToRefund('100.00', []).toFixed(2)).toBe('100.00');
    expect(remainingToRefund('100.00', [{ amount: '30', status: 'DONE' }, { amount: '20', status: 'PENDING' }, { amount: '50', status: 'FAILED' }]).toFixed(2)).toBe('50.00');
    expect(remainingToRefund('10.00', [{ amount: '15', status: 'DONE' }]).toFixed(2)).toBe('0.00');
  });

  it('valida o valor pedido', () => {
    const left = money('50.00');
    expect(resolveRefundAmount(undefined, left).toFixed(2)).toBe('50.00');
    expect(resolveRefundAmount('12,50', left).toFixed(2)).toBe('12.50');
    expect(resolveRefundAmount(50, left).toFixed(2)).toBe('50.00');
    for (const bad of ['0', '-5', 'abc', '10.999', '50.01', '1e3']) expect(() => resolveRefundAmount(bad, left)).toThrow();
    expect(() => resolveRefundAmount(undefined, money(0))).toThrow(/totalmente/);
  });

  it('detecta reembolso total', () => {
    expect(isFullRefund('100', [{ amount: '60', status: 'DONE' }], '40')).toBe(true);
    expect(isFullRefund('100', [{ amount: '60', status: 'DONE' }], '30')).toBe(false);
    expect(isFullRefund('100', [{ amount: '60', status: 'FAILED' }], '40')).toBe(false);
  });
});
