import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { money } from '../../shared/money/money';

/** Endereço público da API do Fidelizei; FIDELIZEI_API_URL troca (homologação). */
export const fidelizeiBaseUrl = () => (process.env.FIDELIZEI_API_URL ?? 'https://api.fidelizaplus.com.br/public/v1').replace(/\/$/, '');

/** Chaves do Fidelizei começam com fz_ (ex.: fz_live_...). Nada de espaço nem quebra de linha. */
export const isFidelizeiKey = (value: string) => /^fz_[A-Za-z0-9_-]{8,300}$/.test(value);

/** Final da chave para o painel mostrar qual está em uso sem revelar o segredo. */
export const keyHint = (value: string) => `${value.slice(0, value.indexOf('_', 3) + 1) || 'fz_'}…${value.slice(-4)}`;

/** Idempotency-Key estável por operação: o mesmo pedido gera a mesma chave; outro conteúdo, outra chave. */
export function idempotencyKey(operation: string, body: unknown) {
  return `storeos-${operation}-${createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 32)}`;
}

export type RewardDiscount = { type: string; value: number; minimumOrderCents?: number };

/**
 * Desconto do benefício sobre o valor dos produtos (já com promoções). Percentual arredonda em centavos;
 * valor fixo vem em centavos. Nunca passa do próprio valor dos produtos.
 */
export function rewardDiscount(discount: RewardDiscount, base: Prisma.Decimal) {
  if (!Number.isInteger(discount.value) || discount.value <= 0) return money(0);
  const raw = discount.type === 'percent' ? base.times(Math.min(discount.value, 100)).dividedBy(100) : new Prisma.Decimal(discount.value).dividedBy(100);
  const amount = money(raw);
  return amount.gt(base) ? money(base) : amount;
}

/** Espera entre tentativas de confirmar/estornar: 1, 2, 5, 10, 30 min e depois de hora em hora. */
export function nextAttempt(attempts: number, now = Date.now()) {
  const minutes = [1, 2, 5, 10, 30][attempts] ?? 60;
  return new Date(now + minutes * 60_000);
}

export const describeDiscount = (discount: RewardDiscount) => discount.type === 'percent' ? `${discount.value}% de desconto` : `${(discount.value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} de desconto`;
