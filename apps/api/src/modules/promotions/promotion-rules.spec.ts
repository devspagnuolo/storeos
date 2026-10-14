import { PromotionType } from '@prisma/client';
import { money } from '../../shared/money/money';
import { evaluatePromotions, PromoLine, PromotionRule } from './promotion-rules';

const line = (sku: string, quantity: number, price: string): PromoLine => ({ sku, quantity, unitPrice: money(price), total: money(price).times(quantity) });
const rule = (over: Partial<PromotionRule>): PromotionRule => ({ id: 'p', name: 'Promo', type: PromotionType.PERCENT_OFF, value: money(10), buyQty: null, payQty: null, minSubtotal: null, skus: [], active: true, startsAt: null, endsAt: null, ...over });

describe('promoções automáticas', () => {
  it('aplica percentual só aos SKUs da promoção', () => {
    const result = evaluatePromotions([line('A', 2, '50.00'), line('B', 1, '100.00')], [rule({ skus: ['A'], value: money(20) })]);
    expect(result.discount.toFixed(2)).toBe('20.00');
    expect(result.applied).toEqual([{ id: 'p', name: 'Promo', amount: '20.00' }]);
  });

  it('leve 3 pague 2 dá uma unidade de graça a cada 3', () => {
    const promo = rule({ type: PromotionType.BUY_X_PAY_Y, buyQty: 3, payQty: 2 });
    expect(evaluatePromotions([line('A', 7, '10.00')], [promo]).discount.toFixed(2)).toBe('20.00');
    expect(evaluatePromotions([line('A', 2, '10.00')], [promo]).discount.toFixed(2)).toBe('0.00');
  });

  it('escolhe a melhor promoção de item e depois aplica o desconto de carrinho sobre o restante', () => {
    const lines = [line('A', 3, '100.00')];
    const promos = [rule({ id: 'x', value: money(10) }), rule({ id: 'y', type: PromotionType.BUY_X_PAY_Y, buyQty: 3, payQty: 2 }), rule({ id: 'c', type: PromotionType.CART_PERCENT, value: money(5), minSubtotal: money(150) })];
    const result = evaluatePromotions(lines, promos);
    // y dá R$100 (melhor que 10% = R$30); carrinho: 5% de R$200 = R$10.
    expect(result.discount.toFixed(2)).toBe('110.00');
    expect(result.applied.map(a => a.id).sort()).toEqual(['c', 'y']);
  });

  it('respeita pedido mínimo, janela de datas e promoção inativa', () => {
    const lines = [line('A', 1, '100.00')];
    const now = new Date('2026-06-15T12:00:00Z');
    expect(evaluatePromotions(lines, [rule({ type: PromotionType.CART_PERCENT, minSubtotal: money(150) })], now).discount.toFixed(2)).toBe('0.00');
    expect(evaluatePromotions(lines, [rule({ startsAt: new Date('2026-07-01T00:00:00Z') })], now).discount.toFixed(2)).toBe('0.00');
    expect(evaluatePromotions(lines, [rule({ endsAt: new Date('2026-06-01T00:00:00Z') })], now).discount.toFixed(2)).toBe('0.00');
    expect(evaluatePromotions(lines, [rule({ active: false })], now).discount.toFixed(2)).toBe('0.00');
  });
});
