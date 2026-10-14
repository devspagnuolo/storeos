import { Prisma } from '@prisma/client';

export const POINTS_PER_REAL = 1;
/** Cada ponto resgatado vale R$ 0,05 em cupom (5% de retorno sobre o que foi gasto). */
export const REAL_PER_POINT = 0.05;

export const TIERS = [
  { key: 'BRONZE', label: 'Bronze', from: 0 },
  { key: 'SILVER', label: 'Prata', from: 500 },
  { key: 'GOLD', label: 'Ouro', from: 2000 },
  { key: 'DIAMOND', label: 'Diamante', from: 5000 },
] as const;
export type TierKey = (typeof TIERS)[number]['key'];

/** Nível pelo total de pontos já ganhos (não cai quando o cliente resgata). */
export function tierFor(lifetimePoints: number) {
  const index = TIERS.reduce((found, tier, i) => (lifetimePoints >= tier.from ? i : found), 0);
  const next = TIERS[index + 1];
  return { ...TIERS[index], next: next ? { key: next.key, label: next.label, missing: next.from - lifetimePoints } : null };
}

/** Pontos por pedido: valor dos produtos já com desconto, sem o frete, arredondado para baixo. */
export function pointsForOrder(subtotal: Prisma.Decimal, discount: Prisma.Decimal) {
  const base = subtotal.minus(discount);
  return base.lte(0) ? 0 : Math.floor(base.times(POINTS_PER_REAL).toNumber());
}
