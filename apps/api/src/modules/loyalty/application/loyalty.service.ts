import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventNames } from '@storeos/contracts';
import { z } from 'zod';
import { BusinessRuleError, NotFoundError } from '../../../shared/domain/errors';
import { fromCents, toCents } from '../../../shared/domain/money';
import { randomToken } from '../../../shared/infrastructure/crypto/encryption.service';
import { EventDispatcher } from '../../../shared/infrastructure/outbox/event-dispatcher';
import { PrismaService, Tx } from '../../../shared/infrastructure/prisma/prisma.service';

export const loyaltyProgramSchema = z.object({
  enabled: z.boolean(),
  pointsPerCurrency: z.number().min(0).max(100),
  cashbackPercent: z.number().min(0).max(50),
  pointValue: z.number().min(0).max(10),
  pointsExpireDays: z.number().int().min(0).max(3650),
  referralBonusPoints: z.number().int().min(0).max(100000),
  tiers: z.record(z.object({ minSpent: z.number().min(0), cashbackBonusPercent: z.number().min(0).max(50) })),
});
export type LoyaltyProgramInput = z.infer<typeof loyaltyProgramSchema>;

const TIER_ORDER = ['BRONZE', 'SILVER', 'GOLD', 'DIAMOND'] as const;
type Tier = (typeof TIER_ORDER)[number];

@Injectable()
export class LoyaltyService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: EventDispatcher,
  ) {}

  onModuleInit(): void {
    this.dispatcher.on(EventNames.ORDER_PAID, 'loyalty.earn', async (e) => {
      const orderId = String(e.payload.orderId);
      await this.earnForOrder(e.storeId, orderId);
    });
    this.dispatcher.on(EventNames.ORDER_STATUS_CHANGED, 'loyalty.reverse', async (e) => {
      if (['CANCELLED', 'REFUNDED'].includes(String(e.payload.to))) await this.reverseForOrder(e.storeId, String(e.payload.orderId));
    });
  }

  async ensureAccount(client: PrismaService | Tx, storeId: string, customerId: string, referralCode?: string) {
    const existing = await client.loyaltyAccount.findUnique({ where: { customerId } });
    if (existing) return existing;
    const referrer = referralCode ? await client.loyaltyAccount.findFirst({ where: { storeId, referralCode: referralCode.toUpperCase() } }) : null;
    return client.loyaltyAccount.create({
      data: { storeId, customerId, referralCode: randomToken(5).replace(/[-_]/g, 'X').toUpperCase().slice(0, 8), referredById: referrer?.id },
    });
  }

  async me(storeId: string, customerId: string) {
    const account = await this.ensureAccount(this.prisma, storeId, customerId);
    const program = await this.program(storeId);
    const tiers = this.tierConfig(program.tiers);
    const current = TIER_ORDER.indexOf(account.tier as Tier);
    const next = TIER_ORDER[current + 1];
    const recent = await this.prisma.loyaltyTransaction.findMany({ where: { accountId: account.id }, orderBy: { createdAt: 'desc' }, take: 20 });
    return {
      tier: account.tier,
      pointsBalance: account.pointsBalance,
      cashbackBalanceCents: toCents(account.cashbackBalance),
      lifetimeSpentCents: toCents(account.lifetimeSpent),
      referralCode: account.referralCode,
      nextTier: next ? { tier: next, remainingSpentCents: Math.max(0, Math.round(tiers[next].minSpent * 100) - toCents(account.lifetimeSpent)) } : null,
      pointValue: Number(program.pointValue),
      transactions: recent.map((t) => ({ id: t.id, type: t.type, currency: t.currency, amount: Number(t.amount), description: t.description, createdAt: t.createdAt.toISOString() })),
    };
  }

  /** Débito atômico de cashback no checkout (nunca deixa o saldo negativo). */
  async redeemCashback(tx: Tx, storeId: string, customerId: string, orderId: string, amountCents: number): Promise<void> {
    if (amountCents <= 0) return;
    const account = await this.ensureAccount(tx, storeId, customerId);
    const rows = await tx.$queryRaw<{ cashbackBalance: string }[]>`
      UPDATE "LoyaltyAccount" SET "cashbackBalance" = "cashbackBalance" - ${fromCents(amountCents)}::numeric, "updatedAt" = now()
       WHERE id = ${account.id} AND "cashbackBalance" >= ${fromCents(amountCents)}::numeric RETURNING "cashbackBalance"::text`;
    if (!rows.length) throw new BusinessRuleError('Saldo de cashback insuficiente', 'INSUFFICIENT_CASHBACK');
    await tx.loyaltyTransaction.create({
      data: { storeId, accountId: account.id, type: 'REDEEM', currency: 'CASHBACK', amount: `-${fromCents(amountCents)}`, balanceAfter: rows[0].cashbackBalance, orderId, description: 'Cashback utilizado no pedido', idempotencyKey: `redeem:${orderId}` },
    });
  }

  async maxRedeemableCents(storeId: string, customerId: string): Promise<number> {
    const account = await this.prisma.loyaltyAccount.findUnique({ where: { customerId } });
    return account ? toCents(account.cashbackBalance) : 0;
  }

  async convertPoints(storeId: string, customerId: string, points: number) {
    if (points < 100) throw new BusinessRuleError('Mínimo de 100 pontos para resgate', 'MIN_POINTS');
    const program = await this.program(storeId);
    return this.prisma.runInTransaction(async (tx) => {
      const account = await this.ensureAccount(tx, storeId, customerId);
      const updated = await tx.loyaltyAccount.updateMany({ where: { id: account.id, pointsBalance: { gte: points } }, data: { pointsBalance: { decrement: points } } });
      if (!updated.count) throw new BusinessRuleError('Pontos insuficientes', 'INSUFFICIENT_POINTS');
      const cashCents = Math.floor(points * Number(program.pointValue) * 100);
      const after = await tx.loyaltyAccount.update({ where: { id: account.id }, data: { cashbackBalance: { increment: fromCents(cashCents) } } });
      await tx.loyaltyTransaction.createMany({
        data: [
          { storeId, accountId: account.id, type: 'REDEEM', currency: 'POINTS', amount: `-${points}`, balanceAfter: String(after.pointsBalance), description: 'Pontos convertidos em cashback' },
          { storeId, accountId: account.id, type: 'EARN', currency: 'CASHBACK', amount: fromCents(cashCents), balanceAfter: after.cashbackBalance.toString(), description: 'Cashback de conversão de pontos' },
        ],
      });
      return { convertedPoints: points, cashbackCents: cashCents };
    });
  }

  // ── Acúmulo ──

  async earnForOrder(storeId: string, orderId: string): Promise<void> {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, storeId } });
    if (!order?.customerId) return;
    const program = await this.program(storeId);
    if (!program.enabled) return;

    await this.prisma.runInTransaction(async (tx) => {
      const account = await this.ensureAccount(tx, storeId, order.customerId as string);
      const key = `earn:${orderId}`;
      if (await tx.loyaltyTransaction.findUnique({ where: { idempotencyKey: key } })) return;

      const tiers = this.tierConfig(program.tiers);
      const base = toCents(order.total) - toCents(order.shippingTotal); // frete não gera pontos
      const spent = Math.max(0, base - toCents(order.cashbackUsed));
      const points = Math.floor((spent / 100) * Number(program.pointsPerCurrency));
      const cashbackPct = Number(program.cashbackPercent) + tiers[account.tier as Tier].cashbackBonusPercent;
      const cashbackCents = Math.floor((spent * cashbackPct) / 100);
      const expires = program.pointsExpireDays > 0 ? new Date(Date.now() + program.pointsExpireDays * 86_400_000) : null;

      const updated = await tx.loyaltyAccount.update({
        where: { id: account.id },
        data: {
          pointsBalance: { increment: points },
          lifetimePoints: { increment: points },
          cashbackBalance: { increment: fromCents(cashbackCents) },
          lifetimeSpent: { increment: fromCents(base) },
        },
      });
      const entries = [];
      if (points > 0) entries.push({ storeId, accountId: account.id, type: 'EARN' as const, currency: 'POINTS' as const, amount: String(points), balanceAfter: String(updated.pointsBalance), orderId, description: `Pontos do pedido ${order.number}`, expiresAt: expires, idempotencyKey: key });
      if (cashbackCents > 0) entries.push({ storeId, accountId: account.id, type: 'EARN' as const, currency: 'CASHBACK' as const, amount: fromCents(cashbackCents), balanceAfter: updated.cashbackBalance.toString(), orderId, description: `Cashback do pedido ${order.number}`, idempotencyKey: points > 0 ? `${key}:cb` : key });
      if (entries.length) await tx.loyaltyTransaction.createMany({ data: entries });
      else await tx.loyaltyTransaction.create({ data: { storeId, accountId: account.id, type: 'ADJUST', currency: 'POINTS', amount: '0', balanceAfter: String(updated.pointsBalance), orderId, description: 'Sem acúmulo', idempotencyKey: key } });

      // Nível por gasto acumulado.
      const lifetime = toCents(updated.lifetimeSpent) / 100;
      const newTier = [...TIER_ORDER].reverse().find((t) => lifetime >= tiers[t].minSpent) ?? 'BRONZE';
      if (newTier !== updated.tier) await tx.loyaltyAccount.update({ where: { id: account.id }, data: { tier: newTier } });

      // Indicação: bônus ao indicador na primeira compra paga do indicado.
      if (updated.referredById && program.referralBonusPoints > 0) {
        const refKey = `referral:${account.id}`;
        if (!(await tx.loyaltyTransaction.findUnique({ where: { idempotencyKey: refKey } }))) {
          const referrer = await tx.loyaltyAccount.update({ where: { id: updated.referredById }, data: { pointsBalance: { increment: program.referralBonusPoints }, lifetimePoints: { increment: program.referralBonusPoints } } });
          await tx.loyaltyTransaction.create({ data: { storeId, accountId: referrer.id, type: 'REFERRAL', currency: 'POINTS', amount: String(program.referralBonusPoints), balanceAfter: String(referrer.pointsBalance), description: 'Bônus por indicação', idempotencyKey: refKey } });
        }
      }
    });
  }

  /** Pedido cancelado/estornado: devolve cashback usado e desfaz o acúmulo. */
  async reverseForOrder(storeId: string, orderId: string): Promise<void> {
    await this.prisma.runInTransaction(async (tx) => {
      const key = `reverse:${orderId}`;
      if (await tx.loyaltyTransaction.findUnique({ where: { idempotencyKey: key } })) return;
      const txs = await tx.loyaltyTransaction.findMany({ where: { storeId, orderId, type: { in: ['EARN', 'REDEEM'] } } });
      if (!txs.length) return;
      const accountId = txs[0].accountId;
      let points = 0;
      let cash = 0;
      for (const t of txs) {
        if (t.currency === 'POINTS') {
          if (t.type === 'EARN') points -= Number(t.amount);
        } else {
          // EARN (positivo) é desfeito; REDEEM (negativo) é devolvido.
          cash -= toCents(t.amount);
        }
      }
      const acc = await tx.loyaltyAccount.findUniqueOrThrow({ where: { id: accountId } });
      const newPoints = Math.max(0, acc.pointsBalance + Math.round(points));
      const newCash = Math.max(0, toCents(acc.cashbackBalance) + cash);
      await tx.loyaltyAccount.update({ where: { id: accountId }, data: { pointsBalance: newPoints, cashbackBalance: fromCents(newCash) } });
      await tx.loyaltyTransaction.create({ data: { storeId, accountId, type: 'ADJUST', currency: 'CASHBACK', amount: fromCents(cash), balanceAfter: fromCents(newCash), orderId, description: 'Estorno de pontos/cashback do pedido', idempotencyKey: key } });
    });
  }

  // ── Programa ──

  async program(storeId: string) {
    return this.prisma.loyaltyProgram.upsert({ where: { storeId }, create: { storeId }, update: {} });
  }

  async updateProgram(storeId: string, input: LoyaltyProgramInput) {
    return this.prisma.loyaltyProgram.update({
      where: { storeId },
      data: { ...input, pointsPerCurrency: String(input.pointsPerCurrency), cashbackPercent: String(input.cashbackPercent), pointValue: String(input.pointValue) },
    });
  }

  async listAccounts(storeId: string, page: number, pageSize: number) {
    const [total, rows] = await Promise.all([
      this.prisma.loyaltyAccount.count({ where: { storeId } }),
      this.prisma.loyaltyAccount.findMany({ where: { storeId }, orderBy: { lifetimeSpent: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { customer: { select: { name: true, email: true } } } }),
    ]);
    return {
      items: rows.map((a) => ({ id: a.id, customer: a.customer.name, email: a.customer.email, tier: a.tier, pointsBalance: a.pointsBalance, cashbackBalanceCents: toCents(a.cashbackBalance), lifetimeSpentCents: toCents(a.lifetimeSpent) })),
      total,
      page,
      pageSize,
    };
  }

  async findAccount(storeId: string, customerId: string) {
    const account = await this.prisma.loyaltyAccount.findFirst({ where: { storeId, customerId } });
    if (!account) throw new NotFoundError('Conta de fidelidade não encontrada');
    return account;
  }

  private tierConfig(raw: unknown): Record<Tier, { minSpent: number; cashbackBonusPercent: number }> {
    const base = { BRONZE: { minSpent: 0, cashbackBonusPercent: 0 }, SILVER: { minSpent: 1000, cashbackBonusPercent: 1 }, GOLD: { minSpent: 5000, cashbackBonusPercent: 2 }, DIAMOND: { minSpent: 15000, cashbackBonusPercent: 4 } };
    const custom = (raw ?? {}) as Partial<typeof base>;
    return { BRONZE: { ...base.BRONZE, ...custom.BRONZE }, SILVER: { ...base.SILVER, ...custom.SILVER }, GOLD: { ...base.GOLD, ...custom.GOLD }, DIAMOND: { ...base.DIAMOND, ...custom.DIAMOND } };
  }
}
