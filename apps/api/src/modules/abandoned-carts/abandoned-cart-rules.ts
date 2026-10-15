import { AbandonedCartStatus } from '@prisma/client';

export const DEFAULT_DELAY_MINUTES = 60;
/** Depois disso o carrinho é considerado velho demais para um lembrete. */
export const MAX_AGE_DAYS = 7;
/** Quem já recebeu um lembrete só recebe outro depois deste intervalo, se voltar a mexer no carrinho. */
export const REMIND_AGAIN_DAYS = 7;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export function delayMinutes(raw = process.env.ABANDONED_CART_DELAY_MINUTES): number {
  const value = Number(raw);
  return Number.isFinite(value) && value >= 1 ? Math.min(Math.trunc(value), 7 * 24 * 60) : DEFAULT_DELAY_MINUTES;
}

type CartState = { status: AbandonedCartStatus; lastActivityAt: Date; remindedAt: Date | null };

/** Estado do carrinho depois de o cliente mexer nele de novo no checkout. null = ignorar (pediu para não receber). */
export function stateAfterActivity(existing: Pick<CartState, 'status' | 'remindedAt'> | null, now: Date): { status: AbandonedCartStatus; remindedAt: Date | null } | null {
  if (!existing) return { status: AbandonedCartStatus.OPEN, remindedAt: null };
  if (existing.status === AbandonedCartStatus.OPTED_OUT) return null;
  if (existing.status === AbandonedCartStatus.RECOVERED) return { status: AbandonedCartStatus.OPEN, remindedAt: null };
  if (existing.status === AbandonedCartStatus.REMINDED) {
    const old = existing.remindedAt && now.getTime() - existing.remindedAt.getTime() >= REMIND_AGAIN_DAYS * DAY;
    return old ? { status: AbandonedCartStatus.OPEN, remindedAt: null } : { status: AbandonedCartStatus.REMINDED, remindedAt: existing.remindedAt };
  }
  return { status: AbandonedCartStatus.OPEN, remindedAt: null };
}

/** Está na hora de lembrar? Só carrinhos abertos, parados há `delay` minutos e ainda recentes. */
export function isDue(cart: CartState, now: Date, delay = delayMinutes()): boolean {
  if (cart.status !== AbandonedCartStatus.OPEN || cart.remindedAt) return false;
  const idle = now.getTime() - cart.lastActivityAt.getTime();
  return idle >= delay * MINUTE && idle <= MAX_AGE_DAYS * DAY;
}

export type CartLine = { productId: string; variantId?: string; variantLabel?: string; slug: string; name: string; price: string; image?: string; quantity: number };

export function sanitizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 180 ? email : null;
}
