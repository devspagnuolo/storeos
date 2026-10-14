import { describe, expect, it } from 'vitest';
import { deliveryTime, formatCep } from './shipping';

describe('formatCep', () => {
  it('aplica a máscara enquanto digita', () => {
    expect(formatCep('0131')).toBe('0131');
    expect(formatCep('013101')).toBe('01310-1');
    expect(formatCep('01310-100999')).toBe('01310-100');
  });
});

describe('deliveryTime', () => {
  it('descreve o prazo', () => {
    expect(deliveryTime({ minDays: 0, maxDays: 0 })).toBe('Entrega no mesmo dia');
    expect(deliveryTime({ minDays: 1, maxDays: 1 })).toBe('1 dia útil');
    expect(deliveryTime({ minDays: 3, maxDays: 8 })).toBe('3 a 8 dias úteis');
  });
});
