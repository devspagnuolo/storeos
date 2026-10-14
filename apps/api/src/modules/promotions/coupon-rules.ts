import { BadRequestException } from '@nestjs/common';
import { CouponType } from '@prisma/client';
import { Money, money } from '../../shared/money/money';

export type CouponRule = {
  code: string; type: CouponType; value: Money; minSubtotal: Money | null; maxUses: number | null; usedCount: number;
  startsAt: Date | null; endsAt: Date | null; active: boolean;
};

export const normalizeCode = (code: string) => code.trim().toUpperCase();

/**
 * Valida o cupom e calcula o desconto. O desconto nunca passa do valor que ele cobre
 * (itens para percentual/fixo, frete para frete grátis), então o total não fica negativo.
 */
export function evaluateCoupon(coupon: CouponRule, subtotal: Money, shipping: Money, now = new Date()): Money {
  if (!coupon.active) throw new BadRequestException('Cupom inativo');
  if (coupon.startsAt && coupon.startsAt > now) throw new BadRequestException('Cupom ainda não está válido');
  if (coupon.endsAt && coupon.endsAt < now) throw new BadRequestException('Cupom expirado');
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) throw new BadRequestException('Cupom esgotado');
  if (coupon.minSubtotal && subtotal.lt(coupon.minSubtotal)) throw new BadRequestException(`Pedido mínimo de R$ ${coupon.minSubtotal.toFixed(2).replace('.', ',')} para este cupom`);
  switch (coupon.type) {
    case CouponType.PERCENT: return money(subtotal.times(coupon.value).div(100));
    case CouponType.FIXED: return money(coupon.value.gt(subtotal) ? subtotal : coupon.value);
    case CouponType.FREE_SHIPPING: return money(shipping);
  }
}
