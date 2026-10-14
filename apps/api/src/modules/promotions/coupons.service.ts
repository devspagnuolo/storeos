import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CouponType, Prisma } from '@prisma/client';
import { Money, money } from '../../shared/money/money';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { evaluateCoupon, normalizeCode } from './coupon-rules';

type Tx = Prisma.TransactionClient;
export type CouponInput = { code: string; description?: string; type: CouponType; value?: number; minSubtotal?: number | null; maxUses?: number | null; oncePerCustomer?: boolean; startsAt?: string | null; endsAt?: string | null; active?: boolean };

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  list(storeId: string) {
    return this.prisma.coupon.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' } });
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
      ...(input.startsAt !== undefined && { startsAt: input.startsAt ? new Date(input.startsAt) : null }),
      ...(input.endsAt !== undefined && { endsAt: input.endsAt ? new Date(input.endsAt) : null }),
      ...(input.active !== undefined && { active: input.active }),
    };
  }

  async create(storeId: string, input: CouponInput) {
    if (input.type !== CouponType.FREE_SHIPPING && !input.value) throw new BadRequestException('Informe o valor do desconto');
    try {
      return await this.prisma.coupon.create({ data: { ...this.data(input), storeId } as Prisma.CouponUncheckedCreateInput });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('Já existe um cupom com esse código');
      throw error;
    }
  }

  async update(storeId: string, id: string, input: Partial<CouponInput>) {
    const done = await this.prisma.coupon.updateMany({ where: { id, storeId }, data: this.data({ ...input, type: input.type }) });
    if (!done.count) throw new NotFoundException('Cupom não encontrado');
    return this.prisma.coupon.findUniqueOrThrow({ where: { id } });
  }

  /** Aplica o cupom dentro da transação do checkout: valida, reserva um uso de forma atômica e devolve o desconto. */
  async redeem(tx: Tx, args: { storeId: string; code: string; subtotal: Money; shipping: Money; customerId: string }) {
    const coupon = await tx.coupon.findUnique({ where: { storeId_code: { storeId: args.storeId, code: normalizeCode(args.code) } } });
    if (!coupon) throw new BadRequestException('Cupom inválido');
    const discount = evaluateCoupon(coupon, args.subtotal, args.shipping);
    if (coupon.oncePerCustomer && await tx.couponRedemption.count({ where: { couponId: coupon.id, customerId: args.customerId } })) throw new BadRequestException('Você já usou este cupom');
    // Condicional no banco: dois pedidos simultâneos não passam do limite de usos.
    const claimed = await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = "usedCount" + 1, "updatedAt" = NOW()
      WHERE "id" = ${coupon.id} AND ("maxUses" IS NULL OR "usedCount" < "maxUses")`;
    if (claimed !== 1) throw new BadRequestException('Cupom esgotado');
    return { coupon, discount };
  }

  /** Pré-visualização para a vitrine: mesma regra do checkout, sem consumir uso. */
  async preview(storeId: string, code: string, subtotal: Money, shipping: Money) {
    const coupon = await this.prisma.coupon.findUnique({ where: { storeId_code: { storeId, code: normalizeCode(code) } } });
    if (!coupon) throw new BadRequestException('Cupom inválido');
    const discount = evaluateCoupon(coupon, subtotal, shipping);
    return { code: coupon.code, type: coupon.type, discount: discount.toFixed(2) };
  }
}
