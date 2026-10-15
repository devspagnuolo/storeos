import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CouponType, LoyaltyEntryType } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { money } from '../../shared/money/money';
import { loadRules } from './rules-store';
import { DEFAULT_RULES, LoyaltyRules, tierFor, tiersOf, validateRules } from './tiers';

@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(storeId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, storeId }, select: { id: true } });
    if (!customer) throw new NotFoundException('Cliente não encontrado');
    const [entries, sums] = await Promise.all([
      this.prisma.loyaltyEntry.findMany({ where: { customerId, storeId }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, type: true, points: true, note: true, createdAt: true } }),
      this.prisma.loyaltyEntry.groupBy({ by: ['type'], where: { customerId, storeId }, _sum: { points: true }, orderBy: { type: 'asc' } }),
    ]);
    const sum = (...types: LoyaltyEntryType[]) => sums.filter(row => types.includes(row.type)).reduce((total, row) => total + (row._sum.points ?? 0), 0);
    const balance = sum('EARN', 'REVERSAL', 'REDEEM', 'ADJUST');
    const rules = await loadRules(this.prisma, storeId);
    return { balance, lifetime: sum('EARN', 'REVERSAL'), tier: tierFor(sum('EARN', 'REVERSAL'), rules), valuePerPoint: rules.realPerPoint, minRedeem: rules.minRedeem, enabled: rules.enabled, entries };
  }

  async config(storeId: string) {
    const rules = await loadRules(this.prisma, storeId);
    return { ...rules, customized: (await this.prisma.loyaltyConfig.count({ where: { storeId } })) > 0, tiers: tiersOf(rules), defaults: DEFAULT_RULES };
  }

  async saveConfig(storeId: string, input: LoyaltyRules) {
    const error = validateRules(input);
    if (error) throw new BadRequestException(error);
    const data = { ...input, minRedeem: Math.max(1, Math.floor(input.minRedeem)) };
    await this.prisma.loyaltyConfig.upsert({ where: { storeId }, create: { storeId, ...data }, update: data });
    return this.config(storeId);
  }

  async resetConfig(storeId: string) {
    await this.prisma.loyaltyConfig.deleteMany({ where: { storeId } });
    return this.config(storeId);
  }

  /** Ajuste manual (positivo ou negativo) com justificativa; o saldo nunca fica negativo. */
  async adjust(storeId: string, customerId: string, points: number, note: string, actorId: string) {
    await this.prisma.$transaction(async tx => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Customer" WHERE "id" = ${customerId} AND "storeId" = ${storeId} FOR UPDATE`;
      if (!locked.length) throw new NotFoundException('Cliente não encontrado');
      const balance = (await tx.loyaltyEntry.aggregate({ where: { customerId }, _sum: { points: true } }))._sum.points ?? 0;
      if (balance + points < 0) throw new BadRequestException('O saldo não pode ficar negativo');
      await tx.loyaltyEntry.create({ data: { storeId, customerId, type: LoyaltyEntryType.ADJUST, points, note, actorId } });
    });
    return this.summary(storeId, customerId);
  }

  /** Troca pontos por um cupom pessoal de uso único (valor fixo). O cliente recebe o código do lojista. */
  async redeem(storeId: string, customerId: string, points: number, actorId: string) {
    const result = await this.prisma.$transaction(async tx => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Customer" WHERE "id" = ${customerId} AND "storeId" = ${storeId} FOR UPDATE`;
      if (!locked.length) throw new NotFoundException('Cliente não encontrado');
      const rules = await loadRules(tx, storeId);
      if (points < rules.minRedeem) throw new BadRequestException(`O resgate mínimo é de ${rules.minRedeem} pontos`);
      const balance = (await tx.loyaltyEntry.aggregate({ where: { customerId }, _sum: { points: true } }))._sum.points ?? 0;
      if (points > balance) throw new BadRequestException(`Saldo insuficiente (${balance} pontos)`);
      const coupon = `PONTOS-${randomBytes(4).toString('hex').toUpperCase()}`;
      await tx.coupon.create({ data: { storeId, code: coupon, description: `Resgate de ${points} pontos`, type: CouponType.FIXED, value: money(points * rules.realPerPoint), maxUses: 1 } });
      await tx.loyaltyEntry.create({ data: { storeId, customerId, type: LoyaltyEntryType.REDEEM, points: -points, note: `Resgate em cupom ${coupon}`, actorId } });
      return { coupon, value: money(points * rules.realPerPoint).toFixed(2) };
    });
    return { code: result.coupon, value: result.value, ...(await this.summary(storeId, customerId)) };
  }
}
