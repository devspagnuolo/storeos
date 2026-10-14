import { PromotionType } from '@prisma/client';
import { Money, money, sumMoney } from '../../shared/money/money';

export type PromotionRule = {
  id: string; name: string; type: PromotionType; value: Money; buyQty: number | null; payQty: number | null;
  minSubtotal: Money | null; skus: string[]; active: boolean; startsAt: Date | null; endsAt: Date | null;
};
export type PromoLine = { sku: string; productSku?: string; quantity: number; unitPrice: Money; total: Money };
export type AppliedPromotion = { id: string; name: string; amount: string };

const isLive = (promotion: PromotionRule, now: Date) => promotion.active && (!promotion.startsAt || promotion.startsAt <= now) && (!promotion.endsAt || promotion.endsAt >= now);
const covers = (promotion: PromotionRule, line: PromoLine) => !promotion.skus.length || promotion.skus.includes(line.sku) || Boolean(line.productSku && promotion.skus.includes(line.productSku));

/** Desconto de uma promoção de item sobre uma linha (percentual ou "leve X pague Y"). */
export function lineDiscount(promotion: PromotionRule, line: PromoLine): Money {
  if (!covers(promotion, line)) return money(0);
  if (promotion.type === PromotionType.PERCENT_OFF) return money(line.total.times(promotion.value).div(100));
  if (promotion.type === PromotionType.BUY_X_PAY_Y && promotion.buyQty && promotion.payQty && promotion.payQty < promotion.buyQty) {
    const free = Math.floor(line.quantity / promotion.buyQty) * (promotion.buyQty - promotion.payQty);
    return money(line.unitPrice.times(free));
  }
  return money(0);
}

/**
 * Cada linha recebe só a melhor promoção de item (não empilham sobre o mesmo produto).
 * Depois, a melhor promoção de carrinho incide sobre o que restou. O desconto nunca passa do subtotal.
 */
export function evaluatePromotions(lines: PromoLine[], promotions: PromotionRule[], now = new Date()): { discount: Money; applied: AppliedPromotion[] } {
  const live = promotions.filter(p => isLive(p, now));
  const byPromotion = new Map<string, Money>();
  let remaining = sumMoney(lines.map(line => line.total));
  for (const line of lines) {
    let best: { promotion: PromotionRule; amount: Money } | undefined;
    for (const promotion of live.filter(p => p.type !== PromotionType.CART_PERCENT)) {
      const amount = lineDiscount(promotion, line);
      if (amount.gt(0) && (!best || amount.gt(best.amount))) best = { promotion, amount };
    }
    if (best) {
      byPromotion.set(best.promotion.id, (byPromotion.get(best.promotion.id) ?? money(0)).plus(best.amount));
      remaining = remaining.minus(best.amount);
    }
  }
  let cart: { promotion: PromotionRule; amount: Money } | undefined;
  for (const promotion of live.filter(p => p.type === PromotionType.CART_PERCENT)) {
    if (promotion.minSubtotal && remaining.lt(promotion.minSubtotal)) continue;
    const amount = money(remaining.times(promotion.value).div(100));
    if (amount.gt(0) && (!cart || amount.gt(cart.amount))) cart = { promotion, amount };
  }
  if (cart) byPromotion.set(cart.promotion.id, cart.amount);
  const applied = [...byPromotion].map(([id, amount]) => ({ id, name: live.find(p => p.id === id)!.name, amount: amount.toFixed(2) }));
  return { discount: sumMoney([...byPromotion.values()]), applied };
}
