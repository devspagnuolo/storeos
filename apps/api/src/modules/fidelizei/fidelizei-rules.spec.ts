import { Prisma } from '@prisma/client';
import { describeDiscount, idempotencyKey, isFidelizeiKey, keyHint, nextAttempt, rewardDiscount } from './fidelizei-rules';

describe('regras do Fidelizei', () => {
  it('aceita só chaves fz_ e mostra apenas o final', () => {
    expect(isFidelizeiKey('fz_live_abcDEF123456')).toBe(true);
    expect(isFidelizeiKey('fz_live_abc DEF')).toBe(false);
    expect(isFidelizeiKey('sk_live_abcdef123456')).toBe(false);
    expect(keyHint('fz_live_abcDEF123456')).toBe('fz_live_…3456');
  });

  it('desconto percentual em centavos e fixo limitado ao valor dos produtos', () => {
    expect(rewardDiscount({ type: 'percent', value: 15 }, new Prisma.Decimal('49.90')).toFixed(2)).toBe('7.49');
    expect(rewardDiscount({ type: 'fixed', value: 1000 }, new Prisma.Decimal('99.80')).toFixed(2)).toBe('10.00');
    expect(rewardDiscount({ type: 'fixed', value: 5000 }, new Prisma.Decimal('30.00')).toFixed(2)).toBe('30.00');
    expect(rewardDiscount({ type: 'percent', value: 0 }, new Prisma.Decimal('30.00')).toFixed(2)).toBe('0.00');
    expect(describeDiscount({ type: 'percent', value: 15 })).toBe('15% de desconto');
  });

  it('mesma operação gera a mesma chave de idempotência; outro conteúdo, outra', () => {
    expect(idempotencyKey('cancel-1', { a: 1 })).toBe(idempotencyKey('cancel-1', { a: 1 }));
    expect(idempotencyKey('cancel-1', { a: 1 })).not.toBe(idempotencyKey('cancel-1', { a: 2 }));
    expect(idempotencyKey('cancel-1', { a: 1 }).length).toBeLessThanOrEqual(128);
  });

  it('espera cresce entre tentativas', () => {
    expect(nextAttempt(0, 0).getTime()).toBe(60_000);
    expect(nextAttempt(9, 0).getTime()).toBe(3_600_000);
  });
});
