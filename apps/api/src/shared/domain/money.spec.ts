import { allocate, fromCents, percentOf, toCents } from './money';

describe('money', () => {
  it('converte Decimal/strings em centavos sem usar float', () => {
    expect(toCents('129.90')).toBe(12990);
    expect(toCents('0.1')).toBe(10);
    expect(toCents('1234')).toBe(123400);
    expect(toCents('19.999')).toBe(2000);
    expect(toCents(null)).toBe(0);
    expect(toCents(12.34)).toBe(1234);
    expect(toCents('-5.50')).toBe(-550);
  });

  it('converte centavos em string decimal', () => {
    expect(fromCents(12990)).toBe('129.90');
    expect(fromCents(5)).toBe('0.05');
    expect(fromCents(0)).toBe('0.00');
    expect(fromCents(-550)).toBe('-5.50');
  });

  it('calcula percentual com arredondamento', () => {
    expect(percentOf(999, 10)).toBe(100);
    expect(percentOf(1000, 12.5)).toBe(125);
  });

  it('rateia sem perder centavos', () => {
    const parts = allocate(100, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(parts.sort()).toEqual([33, 33, 34]);
    expect(allocate(10, [0, 0])).toEqual([0, 0]);
  });
});
