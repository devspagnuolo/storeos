import { describe, expect, it } from 'vitest';
import { formatCardNumber, freeInstallmentOffer, formatCpf, formatExpiry, isEligibleFreeInstallment, isValidCpf, parseExpiry } from './payment';

describe('payment', () => {
  it('formata e valida CPF', () => {
    expect(formatCpf('52998224725')).toBe('529.982.247-25');
    expect(formatCpf('5299')).toBe('529.9');
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('529.982.247-26')).toBe(false);
    expect(isValidCpf('000.000.000-00')).toBe(false);
  });

  it('formata cartão e validade', () => {
    expect(formatCardNumber('4235647728025682')).toBe('4235 6477 2802 5682');
    expect(formatExpiry('1227')).toBe('12/27');
  });

  it('rejeita validade vencida ou inválida', () => {
    const now = new Date('2026-10-14T00:00:00Z');
    expect(parseExpiry('10/26', now)).toEqual({ month: 10, year: 2026 });
    expect(parseExpiry('09/26', now)).toBeUndefined();
    expect(parseExpiry('13/30', now)).toBeUndefined();
    expect(parseExpiry('1', now)).toBeUndefined();
  });

  it('aplica piso de parcela apenas para opções sem juros do Mercado Pago', () => {
    expect(isEligibleFreeInstallment(1, 79, 6, 80)).toBe(true);
    expect(isEligibleFreeInstallment(3, 100, 6, 80)).toBe(true);
    expect(isEligibleFreeInstallment(4, 75, 6, 80)).toBe(false);
    expect(isEligibleFreeInstallment(4, 85, 6, 80)).toBe(true);
    expect(isEligibleFreeInstallment(7, 100, 6, 80)).toBe(false);
  });
});

describe('freeInstallmentOffer', () => {
  const card = { provider: 'mercadopago' as const, publicKey: 'x', maxInstallments: 12, maxFreeInstallments: 6, minFreeInstallment: 80 };
  it('respeita o piso da parcela e o limite sem juros da loja', () => {
    expect(freeInstallmentOffer(459, card)).toEqual({ installments: 5, amount: 91.8 });
    expect(freeInstallmentOffer(999, card)).toEqual({ installments: 6, amount: 166.5 });
    expect(freeInstallmentOffer(159.9, card)).toBeNull();
    expect(freeInstallmentOffer(160, card)).toEqual({ installments: 2, amount: 80 });
  });
  it('sem cartão ou com 1x sem juros não oferece parcelas', () => {
    expect(freeInstallmentOffer(459, null)).toBeNull();
    expect(freeInstallmentOffer(459, { ...card, maxFreeInstallments: 1 })).toBeNull();
  });
});
