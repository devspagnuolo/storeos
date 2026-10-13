import { allocate, percentOf } from '../../../shared/domain/money';

/**
 * Motor de preços (puro e determinístico): aplica promoções automáticas e cupom ao carrinho.
 * Todos os valores em centavos; descontos são rateados entre as linhas sem perder centavos.
 */

export interface PricingLine {
  key: string;
  productId: string;
  categoryIds: string[];
  unitPriceCents: number;
  quantity: number;
}

export interface PromotionRule {
  id: string;
  name: string;
  type: 'BUY_X_GET_Y' | 'PROGRESSIVE_DISCOUNT' | 'CATEGORY_DISCOUNT' | 'FREE_SHIPPING';
  priority: number;
  stackable: boolean;
  rules: Record<string, unknown>;
}

export interface CouponRule {
  code: string;
  type: 'PERCENT' | 'FIXED' | 'FREE_SHIPPING';
  /** PERCENT: 0-100. FIXED: centavos. */
  value: number;
  minSubtotalCents?: number;
  maxDiscountCents?: number;
  productIds?: string[];
  categoryIds?: string[];
  stackable: boolean;
}

export interface PricingInput {
  lines: PricingLine[];
  promotions: PromotionRule[];
  coupon?: CouponRule | null;
  shippingCents: number;
}

export interface PricingResult {
  lineDiscounts: Map<string, number>;
  subtotalCents: number;
  promotionDiscountCents: number;
  couponDiscountCents: number;
  discountCents: number;
  shippingCents: number;
  shippingDiscountCents: number;
  totalCents: number;
  appliedPromotions: { id: string; name: string; discountCents: number }[];
  couponApplied: boolean;
  couponMessage: string | null;
}

const lineTotal = (l: PricingLine) => l.unitPriceCents * l.quantity;

function matchesScope(line: PricingLine, productIds?: string[], categoryIds?: string[]): boolean {
  const hasScope = (productIds?.length ?? 0) > 0 || (categoryIds?.length ?? 0) > 0;
  if (!hasScope) return true;
  return Boolean(productIds?.includes(line.productId) || line.categoryIds.some((c) => categoryIds?.includes(c)));
}

interface Computed {
  discount: number;
  perLine: Map<string, number>;
  freeShipping?: boolean;
}

function spread(lines: PricingLine[], total: number, capByLine: (l: PricingLine) => number): Map<string, number> {
  const out = new Map<string, number>();
  if (total <= 0 || !lines.length) return out;
  const weights = lines.map((l) => capByLine(l));
  const shares = allocate(Math.min(total, weights.reduce((a, b) => a + b, 0)), weights);
  lines.forEach((l, i) => out.set(l.key, Math.min(shares[i], capByLine(l))));
  return out;
}

function evaluatePromotion(promo: PromotionRule, lines: PricingLine[], remaining: (l: PricingLine) => number): Computed {
  const r = promo.rules as Record<string, any>;
  switch (promo.type) {
    case 'CATEGORY_DISCOUNT': {
      const eligible = lines.filter((l) => matchesScope(l, r.productIds, r.categoryIds) && remaining(l) > 0);
      const perLine = new Map<string, number>();
      let discount = 0;
      for (const l of eligible) {
        const d = Math.min(percentOf(remaining(l), Number(r.percent ?? 0)), remaining(l));
        perLine.set(l.key, d);
        discount += d;
      }
      return { discount, perLine };
    }
    case 'BUY_X_GET_Y': {
      const buy = Math.max(1, Number(r.buyQty ?? 1));
      const get = Math.max(1, Number(r.getQty ?? 1));
      const percent = Math.min(100, Number(r.discountPercent ?? 100));
      const eligible = lines.filter((l) => matchesScope(l, r.productIds, r.categoryIds) && remaining(l) > 0);
      // Expande unidades e concede desconto às mais baratas a cada grupo de (buy + get).
      const units: { key: string; price: number }[] = [];
      for (const l of eligible) for (let i = 0; i < l.quantity; i += 1) units.push({ key: l.key, price: l.unitPriceCents });
      units.sort((a, b) => b.price - a.price);
      const groups = Math.floor(units.length / (buy + get));
      const perLine = new Map<string, number>();
      let discount = 0;
      if (groups > 0) {
        const freeUnits = units.slice(units.length - groups * get); // as mais baratas
        for (const u of freeUnits) {
          const d = percentOf(u.price, percent);
          perLine.set(u.key, (perLine.get(u.key) ?? 0) + d);
          discount += d;
        }
      }
      return { discount, perLine };
    }
    case 'PROGRESSIVE_DISCOUNT': {
      const tiers = ((r.tiers ?? []) as { minQty?: number; minSubtotalCents?: number; percent: number }[]).slice().sort((a, b) => b.percent - a.percent);
      const eligible = lines.filter((l) => matchesScope(l, r.productIds, r.categoryIds) && remaining(l) > 0);
      const qty = eligible.reduce((a, l) => a + l.quantity, 0);
      const sub = eligible.reduce((a, l) => a + remaining(l), 0);
      const tier = tiers.find((t) => qty >= (t.minQty ?? 0) && sub >= (t.minSubtotalCents ?? 0));
      if (!tier) return { discount: 0, perLine: new Map() };
      const total = percentOf(sub, tier.percent);
      const perLine = spread(eligible, total, remaining);
      return { discount: [...perLine.values()].reduce((a, b) => a + b, 0), perLine };
    }
    case 'FREE_SHIPPING': {
      const sub = lines.reduce((a, l) => a + remaining(l), 0);
      return { discount: 0, perLine: new Map(), freeShipping: sub >= Number(r.minSubtotalCents ?? 0) };
    }
    default:
      return { discount: 0, perLine: new Map() };
  }
}

export function calculatePricing(input: PricingInput): PricingResult {
  const { lines } = input;
  const subtotal = lines.reduce((a, l) => a + lineTotal(l), 0);
  const lineDiscounts = new Map<string, number>(lines.map((l) => [l.key, 0]));
  const remaining = (l: PricingLine) => lineTotal(l) - (lineDiscounts.get(l.key) ?? 0);

  // 1) Promoções automáticas: por prioridade; uma não-empilhável encerra a avaliação das seguintes.
  const applied: { id: string; name: string; discountCents: number }[] = [];
  let promotionDiscount = 0;
  let promoFreeShipping = false;
  const ordered = [...input.promotions].sort((a, b) => b.priority - a.priority);
  for (const promo of ordered) {
    const result = evaluatePromotion(promo, lines, remaining);
    if (result.freeShipping) promoFreeShipping = true;
    if (result.discount <= 0 && !result.freeShipping) continue;
    for (const [key, d] of result.perLine) lineDiscounts.set(key, (lineDiscounts.get(key) ?? 0) + d);
    promotionDiscount += result.discount;
    applied.push({ id: promo.id, name: promo.name, discountCents: result.discount });
    if (!promo.stackable) break;
  }

  // 2) Cupom sobre o que restou.
  let couponDiscount = 0;
  let couponApplied = false;
  let couponMessage: string | null = null;
  let couponFreeShipping = false;
  const coupon = input.coupon;
  if (coupon) {
    const afterPromos = subtotal - promotionDiscount;
    if (coupon.minSubtotalCents && afterPromos < coupon.minSubtotalCents) {
      couponMessage = `Pedido mínimo de R$ ${(coupon.minSubtotalCents / 100).toFixed(2).replace('.', ',')} para este cupom`;
    } else if (applied.length && !coupon.stackable && promotionDiscount > 0) {
      couponMessage = 'Este cupom não pode ser combinado com promoções já aplicadas';
    } else if (coupon.type === 'FREE_SHIPPING') {
      couponFreeShipping = true;
      couponApplied = true;
    } else {
      const eligible = lines.filter((l) => matchesScope(l, coupon.productIds, coupon.categoryIds) && remaining(l) > 0);
      const base = eligible.reduce((a, l) => a + remaining(l), 0);
      if (base <= 0) {
        couponMessage = 'Cupom não se aplica aos itens do carrinho';
      } else {
        let value = coupon.type === 'PERCENT' ? percentOf(base, coupon.value) : coupon.value;
        if (coupon.maxDiscountCents) value = Math.min(value, coupon.maxDiscountCents);
        value = Math.min(value, base);
        const perLine = spread(eligible, value, remaining);
        for (const [key, d] of perLine) lineDiscounts.set(key, (lineDiscounts.get(key) ?? 0) + d);
        couponDiscount = [...perLine.values()].reduce((a, b) => a + b, 0);
        couponApplied = true;
      }
    }
  }

  const shippingDiscount = promoFreeShipping || couponFreeShipping ? input.shippingCents : 0;
  const discount = promotionDiscount + couponDiscount;
  const total = Math.max(0, subtotal - discount + input.shippingCents - shippingDiscount);

  return {
    lineDiscounts,
    subtotalCents: subtotal,
    promotionDiscountCents: promotionDiscount,
    couponDiscountCents: couponDiscount,
    discountCents: discount,
    shippingCents: input.shippingCents,
    shippingDiscountCents: shippingDiscount,
    totalCents: total,
    appliedPromotions: applied,
    couponApplied,
    couponMessage,
  };
}
