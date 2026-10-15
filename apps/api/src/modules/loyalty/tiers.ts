import { Prisma } from '@prisma/client';

/** Regras do programa de pontos de uma loja. Os padrões valem enquanto o lojista não personaliza. */
export type LoyaltyRules = {
  enabled: boolean;
  /** Pontos ganhos por R$ 1 em produtos (já com desconto, sem frete). */
  pointsPerReal: number;
  /** Quanto cada ponto vale em cupom, em reais. */
  realPerPoint: number;
  /** Menor resgate permitido, em pontos. */
  minRedeem: number;
  silverFrom: number;
  goldFrom: number;
  diamondFrom: number;
  /** Multiplicador de pontos por nível, em % (100 = sem bônus, 150 = 1,5x). */
  silverPct: number;
  goldPct: number;
  diamondPct: number;
};

export const DEFAULT_RULES: LoyaltyRules = {
  enabled: true, pointsPerReal: 1, realPerPoint: 0.05, minRedeem: 1,
  silverFrom: 500, goldFrom: 2000, diamondFrom: 5000,
  silverPct: 100, goldPct: 100, diamondPct: 100,
};
export const POINTS_PER_REAL = DEFAULT_RULES.pointsPerReal;
/** Cada ponto resgatado vale R$ 0,05 em cupom (5% de retorno sobre o que foi gasto). */
export const REAL_PER_POINT = DEFAULT_RULES.realPerPoint;

export type TierKey = 'BRONZE' | 'SILVER' | 'GOLD' | 'DIAMOND';

export function tiersOf(rules: LoyaltyRules = DEFAULT_RULES) {
  return [
    { key: 'BRONZE' as TierKey, label: 'Bronze', from: 0, pct: 100 },
    { key: 'SILVER' as TierKey, label: 'Prata', from: rules.silverFrom, pct: rules.silverPct },
    { key: 'GOLD' as TierKey, label: 'Ouro', from: rules.goldFrom, pct: rules.goldPct },
    { key: 'DIAMOND' as TierKey, label: 'Diamante', from: rules.diamondFrom, pct: rules.diamondPct },
  ];
}
export const TIERS = tiersOf();

/** Nível pelo total de pontos já ganhos (não cai quando o cliente resgata). */
export function tierFor(lifetimePoints: number, rules: LoyaltyRules = DEFAULT_RULES) {
  const tiers = tiersOf(rules);
  const index = tiers.reduce((found, tier, i) => (lifetimePoints >= tier.from ? i : found), 0);
  const next = tiers[index + 1];
  return { key: tiers[index].key, label: tiers[index].label, from: tiers[index].from, pct: tiers[index].pct, next: next ? { key: next.key, label: next.label, missing: next.from - lifetimePoints } : null };
}

/** Pontos por pedido: valor dos produtos já com desconto, sem o frete, vezes o bônus do nível, arredondado para baixo. */
export function pointsForOrder(subtotal: Prisma.Decimal, discount: Prisma.Decimal, rules: LoyaltyRules = DEFAULT_RULES, lifetimePoints = 0) {
  if (!rules.enabled) return 0;
  const base = subtotal.minus(discount);
  if (base.lte(0)) return 0;
  const pct = tierFor(lifetimePoints, rules).pct;
  return Math.floor(base.times(rules.pointsPerReal).times(pct).div(100).toNumber());
}

/** Confere os limites e a ordem dos níveis; devolve a primeira mensagem de erro, ou null. */
export function validateRules(rules: LoyaltyRules): string | null {
  if (rules.pointsPerReal <= 0 || rules.pointsPerReal > 100) return 'Pontos por real deve ficar entre 0,01 e 100';
  if (rules.realPerPoint <= 0 || rules.realPerPoint > 10) return 'Valor do ponto deve ficar entre R$ 0,0001 e R$ 10';
  if (rules.pointsPerReal * rules.realPerPoint > 0.5) return 'O retorno em cupom passaria de 50% do que o cliente gasta';
  if (!(rules.silverFrom > 0 && rules.silverFrom < rules.goldFrom && rules.goldFrom < rules.diamondFrom)) return 'Os níveis precisam crescer: Prata < Ouro < Diamante';
  for (const pct of [rules.silverPct, rules.goldPct, rules.diamondPct]) if (pct < 100 || pct > 500) return 'O bônus de cada nível deve ficar entre 100% e 500%';
  if (!(rules.silverPct <= rules.goldPct && rules.goldPct <= rules.diamondPct)) return 'O bônus não pode diminuir ao subir de nível';
  return null;
}
