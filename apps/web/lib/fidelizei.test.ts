import { describe, expect, it } from 'vitest';
import { rewardAmount, rewardLabel } from './account/types';

describe('benefício do Fidelizei no checkout', () => {
  it('calcula como o servidor: percentual em centavos, fixo em centavos, nunca acima dos produtos', () => {
    expect(rewardAmount({ type: 'percent', value: 15 }, 49.9)).toBe(7.49);
    expect(rewardAmount({ type: 'fixed', value: 1000 }, 72)).toBe(10);
    expect(rewardAmount({ type: 'fixed', value: 5000 }, 30)).toBe(30);
    expect(rewardAmount({ type: 'percent', value: 10 }, 0)).toBe(0);
    expect(rewardLabel({ discountType: 'percent', discountValue: 15 })).toBe('15% de desconto');
  });
});
