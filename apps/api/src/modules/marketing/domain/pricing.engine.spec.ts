import { calculatePricing, PricingLine, PromotionRule } from './pricing.engine';

const line = (key: string, unit: number, qty: number, categoryIds: string[] = [], productId = key): PricingLine => ({
  key,
  productId,
  categoryIds,
  unitPriceCents: unit,
  quantity: qty,
});

describe('calculatePricing', () => {
  it('soma subtotal e total sem descontos', () => {
    const r = calculatePricing({ lines: [line('a', 1000, 2), line('b', 550, 1)], promotions: [], shippingCents: 1500 });
    expect(r.subtotalCents).toBe(2550);
    expect(r.discountCents).toBe(0);
    expect(r.totalCents).toBe(4050);
  });

  it('cupom percentual respeita teto e rateia sem perder centavos', () => {
    const r = calculatePricing({
      lines: [line('a', 3333, 1), line('b', 3333, 1), line('c', 3334, 1)],
      promotions: [],
      coupon: { code: 'X', type: 'PERCENT', value: 10, maxDiscountCents: 900, stackable: false },
      shippingCents: 0,
    });
    expect(r.couponDiscountCents).toBe(900);
    const distributed = [...r.lineDiscounts.values()].reduce((a, b) => a + b, 0);
    expect(distributed).toBe(900);
    expect(r.totalCents).toBe(10000 - 900);
  });

  it('cupom fixo nunca excede o valor do carrinho', () => {
    const r = calculatePricing({ lines: [line('a', 500, 1)], promotions: [], coupon: { code: 'X', type: 'FIXED', value: 9999, stackable: false }, shippingCents: 0 });
    expect(r.couponDiscountCents).toBe(500);
    expect(r.totalCents).toBe(0);
  });

  it('recusa cupom abaixo do pedido mínimo com mensagem', () => {
    const r = calculatePricing({
      lines: [line('a', 1000, 1)],
      promotions: [],
      coupon: { code: 'X', type: 'PERCENT', value: 10, minSubtotalCents: 5000, stackable: false },
      shippingCents: 0,
    });
    expect(r.couponApplied).toBe(false);
    expect(r.couponMessage).toMatch(/mínimo/i);
    expect(r.discountCents).toBe(0);
  });

  it('cupom de frete grátis zera o frete', () => {
    const r = calculatePricing({ lines: [line('a', 1000, 1)], promotions: [], coupon: { code: 'F', type: 'FREE_SHIPPING', value: 0, stackable: false }, shippingCents: 2000 });
    expect(r.shippingDiscountCents).toBe(2000);
    expect(r.totalCents).toBe(1000);
  });

  it('cupom restrito a categoria só desconta itens elegíveis', () => {
    const r = calculatePricing({
      lines: [line('a', 1000, 1, ['cat1']), line('b', 1000, 1, ['cat2'])],
      promotions: [],
      coupon: { code: 'C', type: 'PERCENT', value: 50, categoryIds: ['cat1'], stackable: false },
      shippingCents: 0,
    });
    expect(r.lineDiscounts.get('a')).toBe(500);
    expect(r.lineDiscounts.get('b')).toBe(0);
  });

  it('compre 2 leve 3: a unidade mais barata sai grátis', () => {
    const promo: PromotionRule = { id: 'p1', name: 'Leve 3 pague 2', type: 'BUY_X_GET_Y', priority: 1, stackable: false, rules: { buyQty: 2, getQty: 1, discountPercent: 100 } };
    const r = calculatePricing({ lines: [line('a', 3000, 1), line('b', 2000, 1), line('c', 1000, 1)], promotions: [promo], shippingCents: 0 });
    expect(r.promotionDiscountCents).toBe(1000);
    expect(r.totalCents).toBe(5000);
  });

  it('desconto progressivo escolhe a maior faixa atingida', () => {
    const promo: PromotionRule = {
      id: 'p2',
      name: 'Progressivo',
      type: 'PROGRESSIVE_DISCOUNT',
      priority: 1,
      stackable: false,
      rules: { tiers: [{ minQty: 2, percent: 5 }, { minQty: 4, percent: 10 }] },
    };
    expect(calculatePricing({ lines: [line('a', 1000, 1)], promotions: [promo], shippingCents: 0 }).discountCents).toBe(0);
    expect(calculatePricing({ lines: [line('a', 1000, 2)], promotions: [promo], shippingCents: 0 }).discountCents).toBe(100);
    expect(calculatePricing({ lines: [line('a', 1000, 4)], promotions: [promo], shippingCents: 0 }).discountCents).toBe(400);
  });

  it('promoção não empilhável bloqueia cupom não combinável', () => {
    const promo: PromotionRule = { id: 'p3', name: '10% cat', type: 'CATEGORY_DISCOUNT', priority: 1, stackable: false, rules: { percent: 10 } };
    const r = calculatePricing({
      lines: [line('a', 1000, 1)],
      promotions: [promo],
      coupon: { code: 'X', type: 'PERCENT', value: 10, stackable: false },
      shippingCents: 0,
    });
    expect(r.promotionDiscountCents).toBe(100);
    expect(r.couponApplied).toBe(false);
    expect(r.totalCents).toBe(900);
  });

  it('promoção de frete grátis por valor mínimo', () => {
    const promo: PromotionRule = { id: 'p4', name: 'Frete grátis', type: 'FREE_SHIPPING', priority: 1, stackable: true, rules: { minSubtotalCents: 10000 } };
    expect(calculatePricing({ lines: [line('a', 5000, 1)], promotions: [promo], shippingCents: 1500 }).totalCents).toBe(6500);
    expect(calculatePricing({ lines: [line('a', 5000, 2)], promotions: [promo], shippingCents: 1500 }).totalCents).toBe(10000);
  });
});
