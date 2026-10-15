import { BadRequestException } from '@nestjs/common';
import { CouponType } from '@prisma/client';
import { Money, money } from '../../shared/money/money';

export type CouponRule = {
  code: string; type: CouponType; value: Money; minSubtotal: Money | null; maxUses: number | null; usedCount: number;
  startsAt: Date | null; endsAt: Date | null; active: boolean;
  productIds?: string[]; categoryIds?: string[];
};

export const hasScope = (c: Pick<CouponRule, 'productIds' | 'categoryIds'>) => Boolean(c.productIds?.length || c.categoryIds?.length);

/**
 * Parte do subtotal que o cupom cobre: só os itens dos produtos/categorias escolhidos, já com a
 * fatia das promoções automáticas descontada de forma proporcional. Sem restrição, vale o subtotal todo.
 */
export function eligibleSubtotal(
  coupon: Pick<CouponRule, 'productIds' | 'categoryIds'>,
  lines: { productId: string; total: Money }[],
  categoriesByProduct: Map<string, string[]>,
  subtotal: Money,
  afterPromotions: Money,
): Money {
  if (!hasScope(coupon)) return afterPromotions;
  const products = new Set(coupon.productIds ?? []);
  const categories = new Set(coupon.categoryIds ?? []);
  const eligible = lines.filter(l => products.has(l.productId) || (categoriesByProduct.get(l.productId) ?? []).some(c => categories.has(c)));
  const raw = eligible.reduce((sum, l) => sum.plus(l.total), money(0));
  if (raw.lte(0)) throw new BadRequestException('Este cupom não vale para os produtos do carrinho');
  return subtotal.gt(0) ? money(raw.times(afterPromotions).div(subtotal)) : money(0);
}

export const normalizeCode = (code: string) => code.trim().toUpperCase();

/**
 * Valida o cupom e calcula o desconto. O desconto nunca passa do valor que ele cobre
 * (itens para percentual/fixo, frete para frete grátis), então o total não fica negativo.
 */
export function evaluateCoupon(coupon: CouponRule, subtotal: Money, shipping: Money, now = new Date(), eligible?: Money): Money {
  if (!coupon.active) throw new BadRequestException('Cupom inativo');
  if (coupon.startsAt && coupon.startsAt > now) throw new BadRequestException('Cupom ainda não está válido');
  if (coupon.endsAt && coupon.endsAt < now) throw new BadRequestException('Cupom expirado');
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) throw new BadRequestException('Cupom esgotado');
  if (coupon.minSubtotal && subtotal.lt(coupon.minSubtotal)) throw new BadRequestException(`Pedido mínimo de R$ ${coupon.minSubtotal.toFixed(2).replace('.', ',')} para este cupom`);
  const base = eligible ?? subtotal;
  switch (coupon.type) {
    case CouponType.PERCENT: return money(base.times(coupon.value).div(100));
    case CouponType.FIXED: return money(coupon.value.gt(base) ? base : coupon.value);
    case CouponType.FREE_SHIPPING: return money(shipping);
  }
}
