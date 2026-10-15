import { Prisma } from '@prisma/client';
import { DEFAULT_RULES, pointsForOrder, tierFor, validateRules } from './tiers';

describe('fidelidade', () => {
  it('calcula pontos sobre produtos menos desconto, arredondando para baixo', () => {
    expect(pointsForOrder(new Prisma.Decimal('99.80'), new Prisma.Decimal('10'))).toBe(89);
    expect(pointsForOrder(new Prisma.Decimal('20'), new Prisma.Decimal('20'))).toBe(0);
  });
  it('define nível e quanto falta para o próximo', () => {
    expect(tierFor(0)).toMatchObject({ key: 'BRONZE', next: { key: 'SILVER', missing: 500 } });
    expect(tierFor(500)).toMatchObject({ key: 'SILVER' });
    expect(tierFor(2499)).toMatchObject({ key: 'GOLD', next: { key: 'DIAMOND', missing: 2501 } });
    expect(tierFor(9000)).toMatchObject({ key: 'DIAMOND', next: null });
  });
});

describe('regras personalizadas', () => {
  const rules = { ...DEFAULT_RULES, pointsPerReal: 2, goldFrom: 1000, goldPct: 150, silverPct: 120, diamondPct: 200 };
  it('multiplica pontos por real e pelo bônus do nível', () => {
    expect(pointsForOrder(new Prisma.Decimal('100'), new Prisma.Decimal('0'), rules, 0)).toBe(200);
    expect(pointsForOrder(new Prisma.Decimal('100'), new Prisma.Decimal('0'), rules, 600)).toBe(240);
    expect(pointsForOrder(new Prisma.Decimal('100'), new Prisma.Decimal('0'), rules, 1000)).toBe(300);
    expect(pointsForOrder(new Prisma.Decimal('100'), new Prisma.Decimal('0'), { ...rules, enabled: false }, 0)).toBe(0);
  });
  it('usa os limites de nível da loja', () => {
    expect(tierFor(999, rules).key).toBe('SILVER');
    expect(tierFor(1000, rules)).toMatchObject({ key: 'GOLD', pct: 150 });
  });
  it('recusa regras incoerentes', () => {
    expect(validateRules(rules)).toBeNull();
    expect(validateRules({ ...rules, goldFrom: 400 })).toMatch(/crescer/);
    expect(validateRules({ ...rules, pointsPerReal: 20, realPerPoint: 0.1 })).toMatch(/50%/);
    expect(validateRules({ ...rules, goldPct: 110 })).toMatch(/diminuir/);
    expect(validateRules({ ...rules, pointsPerReal: 0 })).toMatch(/entre/);
  });
});
