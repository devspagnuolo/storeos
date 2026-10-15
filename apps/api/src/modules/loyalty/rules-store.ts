import { Prisma } from '@prisma/client';
import { DEFAULT_RULES, LoyaltyRules } from './tiers';

type Db = Pick<Prisma.TransactionClient, 'loyaltyConfig'>;

/** Regras da loja; sem personalização valem os padrões. */
export async function loadRules(db: Db, storeId: string): Promise<LoyaltyRules> {
  const row = await db.loyaltyConfig.findUnique({ where: { storeId } });
  if (!row) return DEFAULT_RULES;
  return {
    enabled: row.enabled, pointsPerReal: Number(row.pointsPerReal), realPerPoint: Number(row.realPerPoint), minRedeem: row.minRedeem,
    silverFrom: row.silverFrom, goldFrom: row.goldFrom, diamondFrom: row.diamondFrom,
    silverPct: row.silverPct, goldPct: row.goldPct, diamondPct: row.diamondPct,
  };
}
