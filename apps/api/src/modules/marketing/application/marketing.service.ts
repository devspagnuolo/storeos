import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { cents } from '@storeos/contracts';
import { ConflictError, NotFoundError } from '../../../shared/domain/errors';
import { fromCents, toCents } from '../../../shared/domain/money';
import { PrismaService, Tx } from '../../../shared/infrastructure/prisma/prisma.service';
import { CouponRule, PromotionRule } from '../domain/pricing.engine';

export const couponInputSchema = z.object({
  code: z.string().min(3).max(40).transform((v) => v.trim().toUpperCase()),
  description: z.string().max(200).optional(),
  type: z.enum(['PERCENT', 'FIXED', 'FREE_SHIPPING']),
  /** PERCENT: 0-100; FIXED: centavos. */
  value: z.number().min(0).default(0),
  minSubtotalCents: cents.optional(),
  maxDiscountCents: cents.optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  usageLimit: z.number().int().min(1).optional(),
  usagePerCustomer: z.number().int().min(1).optional(),
  productIds: z.array(z.string().uuid()).default([]),
  categoryIds: z.array(z.string().uuid()).default([]),
  firstOrderOnly: z.boolean().default(false),
  stackable: z.boolean().default(false),
  active: z.boolean().default(true),
});
export type CouponInput = z.infer<typeof couponInputSchema>;

export const promotionInputSchema = z.object({
  name: z.string().min(2).max(120),
  type: z.enum(['BUY_X_GET_Y', 'PROGRESSIVE_DISCOUNT', 'CATEGORY_DISCOUNT', 'FREE_SHIPPING']),
  rules: z.record(z.unknown()),
  priority: z.number().int().default(0),
  stackable: z.boolean().default(false),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  active: z.boolean().default(true),
});
export type PromotionInput = z.infer<typeof promotionInputSchema>;

export type CouponCheck = { ok: true; rule: CouponRule; couponId: string } | { ok: false; message: string };

@Injectable()
export class MarketingService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Cupons ──

  async validateCoupon(storeId: string, code: string, ctx: { customerId?: string | null; email?: string | null }): Promise<CouponCheck> {
    const coupon = await this.prisma.coupon.findFirst({ where: { storeId, code: code.trim().toUpperCase() } });
    const now = new Date();
    if (!coupon || !coupon.active) return { ok: false, message: 'Cupom inválido' };
    if (coupon.startsAt && coupon.startsAt > now) return { ok: false, message: 'Este cupom ainda não está disponível' };
    if (coupon.endsAt && coupon.endsAt < now) return { ok: false, message: 'Este cupom expirou' };
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) return { ok: false, message: 'Este cupom atingiu o limite de usos' };

    if (coupon.usagePerCustomer && ctx.customerId) {
      const used = await this.prisma.couponRedemption.count({ where: { couponId: coupon.id, customerId: ctx.customerId } });
      if (used >= coupon.usagePerCustomer) return { ok: false, message: 'Você já utilizou este cupom' };
    }
    if (coupon.firstOrderOnly) {
      const orders = await this.prisma.order.count({
        where: { storeId, status: { notIn: ['CANCELLED'] }, OR: [...(ctx.customerId ? [{ customerId: ctx.customerId }] : []), ...(ctx.email ? [{ customerEmail: ctx.email }] : [])] },
      });
      if (orders > 0 || (!ctx.customerId && !ctx.email)) return { ok: false, message: 'Cupom válido apenas na primeira compra' };
    }
    const applies = (coupon.appliesTo ?? {}) as { productIds?: string[]; categoryIds?: string[] };
    return {
      ok: true,
      couponId: coupon.id,
      rule: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.type === 'FIXED' ? toCents(coupon.value) : Number(coupon.value),
        minSubtotalCents: coupon.minSubtotal ? toCents(coupon.minSubtotal) : undefined,
        maxDiscountCents: coupon.maxDiscount ? toCents(coupon.maxDiscount) : undefined,
        productIds: applies.productIds,
        categoryIds: applies.categoryIds,
        stackable: coupon.stackable,
      },
    };
  }

  /** Registra o uso do cupom na transação do pedido (limite global protegido por UPDATE condicional). */
  async redeem(tx: Tx, input: { couponId: string; orderId: string; customerId?: string | null; amountCents: number }): Promise<void> {
    const updated = await tx.$executeRaw`
      UPDATE "Coupon" SET "usedCount" = "usedCount" + 1
       WHERE id = ${input.couponId} AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`;
    if (updated === 0) throw new ConflictError('Este cupom atingiu o limite de usos', 'COUPON_EXHAUSTED');
    await tx.couponRedemption.create({ data: { couponId: input.couponId, orderId: input.orderId, customerId: input.customerId ?? null, amount: fromCents(input.amountCents) } });
  }

  async releaseRedemption(tx: Tx, orderId: string): Promise<void> {
    const redemptions = await tx.couponRedemption.findMany({ where: { orderId } });
    for (const r of redemptions) {
      await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = GREATEST("usedCount" - 1, 0) WHERE id = ${r.couponId}`;
    }
    await tx.couponRedemption.deleteMany({ where: { orderId } });
  }

  listCoupons(storeId: string) {
    return this.prisma.coupon.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' } });
  }

  async createCoupon(storeId: string, input: CouponInput) {
    try {
      return await this.prisma.coupon.create({ data: this.couponData(storeId, input) });
    } catch {
      throw new ConflictError('Já existe um cupom com este código', 'COUPON_EXISTS');
    }
  }

  async updateCoupon(storeId: string, id: string, input: Partial<CouponInput>) {
    const found = await this.prisma.coupon.findFirst({ where: { id, storeId } });
    if (!found) throw new NotFoundError('Cupom não encontrado', 'COUPON_NOT_FOUND');
    const { storeId: _s, ...data } = this.couponData(storeId, { ...(input as CouponInput), type: input.type ?? found.type });
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    return this.prisma.coupon.update({ where: { id }, data: clean });
  }

  private couponData(storeId: string, input: CouponInput) {
    return {
      storeId,
      code: input.code,
      description: input.description,
      type: input.type,
      value: input.type === 'FIXED' ? fromCents(Math.round(input.value)) : input.value === undefined ? undefined : String(input.value),
      minSubtotal: input.minSubtotalCents === undefined ? undefined : fromCents(input.minSubtotalCents),
      maxDiscount: input.maxDiscountCents === undefined ? undefined : fromCents(input.maxDiscountCents),
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      usageLimit: input.usageLimit,
      usagePerCustomer: input.usagePerCustomer,
      appliesTo: input.productIds || input.categoryIds ? { productIds: input.productIds ?? [], categoryIds: input.categoryIds ?? [] } : undefined,
      firstOrderOnly: input.firstOrderOnly,
      stackable: input.stackable,
      active: input.active,
    };
  }

  // ── Promoções automáticas ──

  async activePromotions(storeId: string): Promise<PromotionRule[]> {
    const now = new Date();
    const rows = await this.prisma.promotion.findMany({
      where: { storeId, active: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] },
      orderBy: { priority: 'desc' },
    });
    return rows.map((p) => ({ id: p.id, name: p.name, type: p.type, priority: p.priority, stackable: p.stackable, rules: (p.rules ?? {}) as Record<string, unknown> }));
  }

  listPromotions(storeId: string) {
    return this.prisma.promotion.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' } });
  }

  createPromotion(storeId: string, input: PromotionInput) {
    return this.prisma.promotion.create({ data: { storeId, ...input, rules: input.rules as never } });
  }

  async updatePromotion(storeId: string, id: string, input: Partial<PromotionInput>) {
    const found = await this.prisma.promotion.findFirst({ where: { id, storeId } });
    if (!found) throw new NotFoundError('Promoção não encontrada');
    return this.prisma.promotion.update({ where: { id }, data: { ...input, rules: input.rules as never } });
  }
}
