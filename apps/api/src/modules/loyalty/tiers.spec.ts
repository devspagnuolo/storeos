import { Prisma } from '@prisma/client';
import { pointsForOrder, tierFor } from './tiers';

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
