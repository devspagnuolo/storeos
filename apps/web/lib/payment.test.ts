import { describe, expect, it } from 'vitest';
import { formatCardNumber, formatCpf, formatExpiry, installmentCount, isValidCpf, parseExpiry } from './payment';

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

  it('limita parcelas pelo valor mínimo', () => {
    expect(installmentCount(30, 12, 5)).toBe(6);
    expect(installmentCount(300, 12, 5)).toBe(12);
    expect(installmentCount(2, 12, 5)).toBe(1);
  });
});
