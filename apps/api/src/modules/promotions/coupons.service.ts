import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CouponType, OrderStatus, Prisma } from '@prisma/client';
import { Money, money } from '../../shared/money/money';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { randomInt } from 'node:crypto';
import { eligibleSubtotal, evaluateCoupon, hasScope, normalizeCode } from './coupon-rules';

type Tx = Prisma.TransactionClient;
export type CouponInput = { code: string; description?: string; type: CouponType; value?: number; minSubtotal?: number | null; maxUses?: number | null; oncePerCustomer?: boolean; firstOrderOnly?: boolean; productIds?: string[]; categoryIds?: string[]; startsAt?: string | null; endsAt?: string | null; active?: boolean };

export type BulkInput = Omit<CouponInput, 'code' | 'maxUses'> & { prefix: string; count: number; campaign: string };
export type CouponLine = { productId: string; total: Money };
export type CouponStats = { uses: number; paidOrders: number; revenue: string; discount: string };
const EMPTY_STATS: CouponStats = { uses: 0, paidOrders: 0, revenue: '0.00', discount: '0.00' };
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cupons avulsos (os de campanha aparecem agrupados em `campaigns`), já com o desempenho de cada um. */
  async list(storeId: string) {
    const coupons = await this.prisma.coupon.findMany({ where: { storeId, campaign: null }, orderBy: { createdAt: 'desc' } });
    const stats = await this.stats(storeId, coupons.map(c => c.id));
    return coupons.map(c => ({ ...c, stats: stats.get(c.id) ?? EMPTY_STATS }));
  }

  /** Usos, pedidos pagos, receita e desconto concedido por cupom. Receita só conta pedido que chegou a ser pago. */
  private async stats(storeId: string, couponIds: string[]) {
    const out = new Map<string, CouponStats>();
    if (!couponIds.length) return out;
    const rows = await this.prisma.$queryRaw<{ couponId: string; uses: number; paidOrders: number; revenue: Prisma.Decimal; discount: Prisma.Decimal }[]>`
      SELECT cr."couponId", COUNT(*)::int AS "uses",
        (COUNT(*) FILTER (WHERE o."status"::text IN ('PAID','PICKING','INVOICED','SHIPPED','DELIVERED')))::int AS "paidOrders",
        COALESCE(SUM(o."total") FILTER (WHERE o."status"::text IN ('PAID','PICKING','INVOICED','SHIPPED','DELIVERED')), 0) AS "revenue",
        COALESCE(SUM(cr."amount") FILTER (WHERE o."status"::text NOT IN ('CANCELLED')), 0) AS "discount"
      FROM "CouponRedemption" cr JOIN "Order" o ON o."id" = cr."orderId"
      WHERE o."storeId" = ${storeId} AND cr."couponId" IN (${Prisma.join(couponIds)})
      GROUP BY cr."couponId"`;
    for (const r of rows) out.set(r.couponId, { uses: r.uses, paidOrders: r.paidOrders, revenue: Number(r.revenue).toFixed(2), discount: Number(r.discount).toFixed(2) });
    return out;
  }

  /** Resumo de cada campanha de códigos em lote. */
  async campaigns(storeId: string) {
    const coupons = await this.prisma.coupon.findMany({ where: { storeId, campaign: { not: null } }, orderBy: { createdAt: 'desc' } });
    const stats = await this.stats(storeId, coupons.map(c => c.id));
    const byName = new Map<string, { name: string; type: CouponType; value: string; total: number; used: number; paidOrders: number; revenue: number; discount: number; createdAt: Date; active: boolean }>();
    for (const c of coupons) {
      const st = stats.get(c.id) ?? EMPTY_STATS;
      const row = byName.get(c.campaign!) ?? { name: c.campaign!, type: c.type, value: c.value.toFixed(2), total: 0, used: 0, paidOrders: 0, revenue: 0, discount: 0, createdAt: c.createdAt, active: false };
      row.total += 1; row.used += c.usedCount; row.paidOrders += st.paidOrders; row.revenue += Number(st.revenue); row.discount += Number(st.discount);
      row.active = row.active || c.active;
      byName.set(c.campaign!, row);
    }
    return [...byName.values()].map(r => ({ ...r, revenue: r.revenue.toFixed(2), discount: r.discount.toFixed(2) }));
  }

  /** Todos os códigos de uma campanha, para copiar ou baixar. */
  async campaignCodes(storeId: string, name: string) {
    const coupons = await this.prisma.coupon.findMany({ where: { storeId, campaign: name }, orderBy: { code: 'asc' } });
    if (!coupons.length) throw new NotFoundException('Campanha não encontrada');
    return coupons.map(c => ({ id: c.id, code: c.code, used: c.usedCount > 0, active: c.active }));
  }

  /** Liga ou desliga todos os códigos da campanha de uma vez. */
  async setCampaignActive(storeId: string, name: string, active: boolean) {
    const done = await this.prisma.coupon.updateMany({ where: { storeId, campaign: name }, data: { active } });
    if (!done.count) throw new NotFoundException('Campanha não encontrada');
    return { updated: done.count };
  }

  /** Gera N códigos únicos (um uso cada) com as mesmas regras. Alfabeto sem 0/O/1/I para ninguém errar ao digitar. */
  async createBulk(storeId: string, input: BulkInput) {
    if (input.type !== CouponType.FREE_SHIPPING && !input.value) throw new BadRequestException('Informe o valor do desconto');
    const prefix = normalizeCode(input.prefix);
    await this.assertScope(storeId, input);
    const base = this.data({ ...input, code: undefined, maxUses: 1 });
    const created: string[] = [];
    for (let attempt = 0; attempt < 5 && created.length < input.count; attempt++) {
      const missing = input.count - created.length;
      const codes = new Set<string>();
      while (codes.size < missing) codes.add(`${prefix}-${Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')}`);
      const rows = [...codes].map(code => ({ ...base, code, storeId, campaign: input.campaign.trim(), maxUses: 1 }) as Prisma.CouponCreateManyInput);
      const before = await this.prisma.coupon.findMany({ where: { storeId, code: { in: [...codes] } }, select: { code: true } });
      const taken = new Set(before.map(b => b.code));
      const fresh = rows.filter(r => !taken.has(r.code));
      const res = await this.prisma.coupon.createMany({ data: fresh, skipDuplicates: true });
      if (res.count === fresh.length) created.push(...fresh.map(r => r.code));
      else {
        const saved = await this.prisma.coupon.findMany({ where: { storeId, code: { in: fresh.map(r => r.code) }, campaign: input.campaign.trim() }, select: { code: true } });
        created.push(...saved.map(s => s.code));
      }
    }
    return { campaign: input.campaign.trim(), created: created.length, codes: created };
  }

  /** Produtos e categorias escolhidos precisam ser desta loja. */
  private async assertScope(storeId: string, input: Partial<CouponInput>) {
    if (input.productIds?.length) {
      const found = await this.prisma.product.count({ where: { storeId, id: { in: input.productIds } } });
      if (found !== new Set(input.productIds).size) throw new BadRequestException('Algum produto escolhido não existe');
    }
    if (input.categoryIds?.length) {
      const found = await this.prisma.category.count({ where: { storeId, id: { in: input.categoryIds } } });
      if (found !== new Set(input.categoryIds).size) throw new BadRequestException('Alguma categoria escolhida não existe');
    }
  }

  private data(input: Partial<CouponInput>) {
    if (input.type === CouponType.PERCENT && input.value !== undefined && (input.value <= 0 || input.value > 100)) throw new BadRequestException('Percentual deve estar entre 0 e 100');
    if (input.type === CouponType.FIXED && input.value !== undefined && input.value <= 0) throw new BadRequestException('Informe um valor maior que zero');
    return {
      ...(input.code !== undefined && { code: normalizeCode(input.code) }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.value !== undefined && { value: money(input.value) }),
      ...(input.minSubtotal !== undefined && { minSubtotal: input.minSubtotal === null ? null : money(input.minSubtotal) }),
      ...(input.maxUses !== undefined && { maxUses: input.maxUses }),
      ...(input.oncePerCustomer !== undefined && { oncePerCustomer: input.oncePerCustomer }),
      ...(input.firstOrderOnly !== undefined && { firstOrderOnly: input.firstOrderOnly }),
      ...(input.productIds !== undefined && { productIds: [...new Set(input.productIds)] }),
      ...(input.categoryIds !== undefined && { categoryIds: [...new Set(input.categoryIds)] }),
      ...(input.startsAt !== undefined && { startsAt: input.startsAt ? new Date(input.startsAt) : null }),
      ...(input.endsAt !== undefined && { endsAt: input.endsAt ? new Date(input.endsAt) : null }),
      ...(input.active !== undefined && { active: input.active }),
    };
  }

  async create(storeId: string, input: CouponInput) {
    if (input.type !== CouponType.FREE_SHIPPING && !input.value) throw new BadRequestException('Informe o valor do desconto');
    await this.assertScope(storeId, input);
    try {
      return await this.prisma.coupon.create({ data: { ...this.data(input), storeId } as Prisma.CouponUncheckedCreateInput });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('Já existe um cupom com esse código');
      throw error;
    }
  }

  async update(storeId: string, id: string, input: Partial<CouponInput>) {
    await this.assertScope(storeId, input);
    const done = await this.prisma.coupon.updateMany({ where: { id, storeId }, data: this.data({ ...input, type: input.type }) });
    if (!done.count) throw new NotFoundException('Cupom não encontrado');
    return this.prisma.coupon.findUniqueOrThrow({ where: { id } });
  }

  /** Aplica o cupom dentro da transação do checkout: valida, reserva um uso de forma atômica e devolve o desconto. */
  async redeem(tx: Tx, args: { storeId: string; code: string; subtotal: Money; afterPromotions: Money; lines: CouponLine[]; shipping: Money; customerId: string }) {
    const coupon = await tx.coupon.findUnique({ where: { storeId_code: { storeId: args.storeId, code: normalizeCode(args.code) } } });
    if (!coupon) throw new BadRequestException('Cupom inválido');
    const eligible = await this.eligible(tx, coupon, args.lines, args.subtotal, args.afterPromotions);
    const discount = evaluateCoupon(coupon, args.afterPromotions, args.shipping, new Date(), eligible);
    if (coupon.firstOrderOnly && await tx.order.count({ where: { storeId: args.storeId, customerId: args.customerId, status: { not: OrderStatus.CANCELLED } } })) throw new BadRequestException('Este cupom vale só para a primeira compra');
    if (coupon.oncePerCustomer && await tx.couponRedemption.count({ where: { couponId: coupon.id, customerId: args.customerId } })) throw new BadRequestException('Você já usou este cupom');
    // Condicional no banco: dois pedidos simultâneos não passam do limite de usos.
    const claimed = await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = "usedCount" + 1, "updatedAt" = NOW()
      WHERE "id" = ${coupon.id} AND ("maxUses" IS NULL OR "usedCount" < "maxUses")`;
    if (claimed !== 1) throw new BadRequestException('Cupom esgotado');
    return { coupon, discount };
  }

  /** Pré-visualização para a vitrine: mesma regra do checkout, sem consumir uso. */
  async preview(storeId: string, code: string, subtotal: Money, afterPromotions: Money, lines: CouponLine[], shipping: Money) {
    const coupon = await this.prisma.coupon.findUnique({ where: { storeId_code: { storeId, code: normalizeCode(code) } } });
    if (!coupon) throw new BadRequestException('Cupom inválido');
    const eligible = await this.eligible(this.prisma, coupon, lines, subtotal, afterPromotions);
    const discount = evaluateCoupon(coupon, afterPromotions, shipping, new Date(), eligible);
    // A regra "só primeira compra" depende de quem compra; ela é conferida no checkout.
    return { code: coupon.code, type: coupon.type, discount: discount.toFixed(2), firstOrderOnly: coupon.firstOrderOnly };
  }

  private async eligible(db: Pick<Tx, 'productCategory'>, coupon: { productIds: string[]; categoryIds: string[] }, lines: CouponLine[], subtotal: Money, afterPromotions: Money) {
    if (!hasScope(coupon)) return undefined;
    const links = coupon.categoryIds.length
      ? await db.productCategory.findMany({ where: { productId: { in: lines.map(l => l.productId) }, categoryId: { in: coupon.categoryIds } } })
      : [];
    const byProduct = new Map<string, string[]>();
    for (const l of links) byProduct.set(l.productId, [...(byProduct.get(l.productId) ?? []), l.categoryId]);
    return eligibleSubtotal(coupon, lines, byProduct, subtotal, afterPromotions);
  }
}
