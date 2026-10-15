import { AbandonedCartStatus as S } from '@prisma/client';
import { delayMinutes, isDue, sanitizeEmail, stateAfterActivity } from './abandoned-cart-rules';

const now = new Date('2026-10-15T12:00:00Z');
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

describe('regras de carrinho abandonado', () => {
  it('só lembra carrinho aberto, parado há tempo suficiente e ainda recente', () => {
    expect(isDue({ status: S.OPEN, lastActivityAt: ago(30), remindedAt: null }, now, 60)).toBe(false);
    expect(isDue({ status: S.OPEN, lastActivityAt: ago(61), remindedAt: null }, now, 60)).toBe(true);
    expect(isDue({ status: S.OPEN, lastActivityAt: ago(8 * 24 * 60), remindedAt: null }, now, 60)).toBe(false);
    expect(isDue({ status: S.REMINDED, lastActivityAt: ago(120), remindedAt: ago(10) }, now, 60)).toBe(false);
    expect(isDue({ status: S.RECOVERED, lastActivityAt: ago(120), remindedAt: null }, now, 60)).toBe(false);
    expect(isDue({ status: S.OPTED_OUT, lastActivityAt: ago(120), remindedAt: null }, now, 60)).toBe(false);
  });

  it('respeita quem pediu para não receber e reabre só depois de uma semana', () => {
    expect(stateAfterActivity(null, now)).toEqual({ status: S.OPEN, remindedAt: null });
    expect(stateAfterActivity({ status: S.OPTED_OUT, remindedAt: null }, now)).toBeNull();
    expect(stateAfterActivity({ status: S.RECOVERED, remindedAt: null }, now)).toEqual({ status: S.OPEN, remindedAt: null });
    expect(stateAfterActivity({ status: S.REMINDED, remindedAt: ago(60) }, now)?.status).toBe(S.REMINDED);
    expect(stateAfterActivity({ status: S.REMINDED, remindedAt: ago(8 * 24 * 60) }, now)).toEqual({ status: S.OPEN, remindedAt: null });
  });

  it('lê a espera configurada com limites', () => {
    expect(delayMinutes(undefined)).toBe(60);
    expect(delayMinutes('abc')).toBe(60);
    expect(delayMinutes('0')).toBe(60);
    expect(delayMinutes('15')).toBe(15);
    expect(delayMinutes('999999')).toBe(7 * 24 * 60);
  });

  it('valida e normaliza o e-mail', () => {
    expect(sanitizeEmail('  Ana@Loja.com ')).toBe('ana@loja.com');
    expect(sanitizeEmail('sem-arroba')).toBeNull();
  });
});
