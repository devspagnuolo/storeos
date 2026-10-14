import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Promotion, PromotionType } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/prisma.service';
import { money } from '../../shared/money/money';
import { OrderLine } from '../orders/order-lines';
import { evaluatePromotions, PromotionRule } from './promotion-rules';

export type PromotionInput = {
  name: string; type: PromotionType; value?: number; buyQty?: number | null; payQty?: number | null; minSubtotal?: number | null;
  skus?: string[]; active?: boolean; startsAt?: string | null; endsAt?: string | null;
};

type Db = Pick<Prisma.TransactionClient, 'promotion'>;

const toRule = (p: Promotion): PromotionRule => ({ id: p.id, name: p.name, type: p.type, value: p.value, buyQty: p.buyQty, payQty: p.payQty, minSubtotal: p.minSubtotal, skus: p.skus, active: p.active, startsAt: p.startsAt, endsAt: p.endsAt });

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  list(storeId: string) {
    return this.prisma.promotion.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' } });
  }

  async create(storeId: string, input: PromotionInput) {
    return this.prisma.promotion.create({ data: { storeId, ...this.data(input) } });
  }

  async update(storeId: string, id: string, input: Partial<PromotionInput>) {
    const current = await this.prisma.promotion.findFirst({ where: { id, storeId } });
    if (!current) throw new NotFoundException('Promoção não encontrada');
    return this.prisma.promotion.update({ where: { id }, data: this.data({ ...current, value: current.value.toNumber(), minSubtotal: current.minSubtotal?.toNumber() ?? null, startsAt: current.startsAt?.toISOString() ?? null, endsAt: current.endsAt?.toISOString() ?? null, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) }) });
  }

  async remove(storeId: string, id: string) {
    const { count } = await this.prisma.promotion.deleteMany({ where: { id, storeId } });
    if (!count) throw new NotFoundException('Promoção não encontrada');
  }

  /** Calcula o desconto automático das linhas do pedido com as promoções vigentes da loja. */
  async evaluate(db: Db, storeId: string, lines: OrderLine[]) {
    const promotions = await db.promotion.findMany({ where: { storeId, active: true } });
    return evaluatePromotions(lines, promotions.map(toRule));
  }

  private data(input: PromotionInput) {
    const name = input.name.trim();
    if (name.length < 2) throw new BadRequestException('Dê um nome à promoção');
    const value = money(input.value ?? 0);
    if (input.type === PromotionType.BUY_X_PAY_Y) {
      if (!input.buyQty || !input.payQty || input.payQty >= input.buyQty || input.payQty < 1) throw new BadRequestException('Em "leve X pague Y", Y deve ser menor que X');
    } else if (value.lte(0) || value.gt(100)) {
      throw new BadRequestException('O percentual deve ficar entre 0,01 e 100');
    }
    const startsAt = input.startsAt ? new Date(input.startsAt) : null;
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (startsAt && endsAt && endsAt < startsAt) throw new BadRequestException('A data final deve ser depois da inicial');
    const isBuyPay = input.type === PromotionType.BUY_X_PAY_Y;
    return {
      name, type: input.type, value: isBuyPay ? money(0) : value,
      buyQty: isBuyPay ? input.buyQty : null, payQty: isBuyPay ? input.payQty : null,
      minSubtotal: input.type === PromotionType.CART_PERCENT && input.minSubtotal ? money(input.minSubtotal) : null,
      skus: input.type === PromotionType.CART_PERCENT ? [] : [...new Set((input.skus ?? []).map(s => s.trim()).filter(Boolean))],
      active: input.active ?? true, startsAt, endsAt,
    };
  }
}
