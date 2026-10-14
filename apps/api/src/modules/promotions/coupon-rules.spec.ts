import { CouponType, Prisma } from '@prisma/client';
import { CouponRule, evaluateCoupon } from './coupon-rules';

const d = (v: string | number) => new Prisma.Decimal(v);
const base: CouponRule = { code: 'X', type: CouponType.PERCENT, value: d(10), minSubtotal: null, maxUses: null, usedCount: 0, startsAt: null, endsAt: null, active: true };

describe('evaluateCoupon', () => {
  it('calcula percentual, fixo limitado ao subtotal e frete grátis', () => {
    expect(evaluateCoupon(base, d('99.90'), d(10)).toFixed(2)).toBe('9.99');
    expect(evaluateCoupon({ ...base, type: CouponType.FIXED, value: d(30) }, d(20), d(10)).toFixed(2)).toBe('20.00');
    expect(evaluateCoupon({ ...base, type: CouponType.FREE_SHIPPING, value: d(0) }, d(50), d('18.50')).toFixed(2)).toBe('18.50');
  });
  it('recusa cupom inativo, fora da vigência, esgotado ou abaixo do mínimo', () => {
    const now = new Date('2026-10-14T12:00:00Z');
    expect(() => evaluateCoupon({ ...base, active: false }, d(50), d(0), now)).toThrow('inativo');
    expect(() => evaluateCoupon({ ...base, startsAt: new Date('2026-11-01') }, d(50), d(0), now)).toThrow('não está válido');
    expect(() => evaluateCoupon({ ...base, endsAt: new Date('2026-10-01') }, d(50), d(0), now)).toThrow('expirado');
    expect(() => evaluateCoupon({ ...base, maxUses: 5, usedCount: 5 }, d(50), d(0), now)).toThrow('esgotado');
    expect(() => evaluateCoupon({ ...base, minSubtotal: d(100) }, d(50), d(0), now)).toThrow('mínimo');
  });
});
