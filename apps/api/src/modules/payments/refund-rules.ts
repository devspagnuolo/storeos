import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { money } from '../../shared/money/money';

export type RefundLike = { amount: Prisma.Decimal.Value; status: 'PENDING' | 'DONE' | 'FAILED' };

/** Quanto ainda pode ser devolvido: pendentes contam como já reservados, para não devolver duas vezes. */
export function remainingToRefund(paid: Prisma.Decimal.Value, refunds: RefundLike[]) {
  const used = refunds.filter(refund => refund.status !== 'FAILED').reduce((sum, refund) => sum.plus(money(refund.amount)), money(0));
  const left = money(paid).minus(used);
  return left.isNegative() ? money(0) : left;
}

/** Valor pedido (ou o restante, se não informado). Recusa zero, negativo, mais de 2 casas e acima do restante. */
export function resolveRefundAmount(requested: unknown, remaining: Prisma.Decimal): Prisma.Decimal {
  if (requested === undefined || requested === null || requested === '') {
    if (!remaining.gt(0)) throw new BadRequestException('Este pagamento já foi totalmente reembolsado.');
    return remaining;
  }
  const text = String(requested).trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new BadRequestException('Informe o valor em reais com até 2 casas decimais.');
  const amount = money(text);
  if (!amount.gt(0)) throw new BadRequestException('O valor do reembolso deve ser maior que zero.');
  if (amount.gt(remaining)) throw new BadRequestException(`O valor excede o que ainda pode ser reembolsado (R$ ${remaining.toFixed(2)}).`);
  return amount;
}

/** O reembolso é total quando, somado aos anteriores concluídos, cobre o valor pago. */
export const isFullRefund = (paid: Prisma.Decimal.Value, done: RefundLike[], current: Prisma.Decimal.Value) =>
  money(done.filter(r => r.status === 'DONE').reduce((sum, r) => sum.plus(money(r.amount)), money(0)).plus(money(current))).gte(money(paid));
