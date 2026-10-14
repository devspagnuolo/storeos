import { resolveRange } from './range';

describe('resolveRange', () => {
  it('usa os últimos 30 dias por padrão, incluindo hoje no horário de Brasília (01:30 UTC ainda é dia 14)', () => {
    const { start, end } = resolveRange(undefined, undefined, new Date('2026-10-15T01:30:00Z'));
    expect(end.toISOString()).toBe('2026-10-15T03:00:00.000Z');
    expect(start.toISOString()).toBe('2026-09-15T03:00:00.000Z');
  });
  it('recusa período invertido, inválido ou longo demais', () => {
    expect(() => resolveRange('2026-10-10', '2026-10-01')).toThrow('anterior');
    expect(() => resolveRange('xx', '2026-10-01')).toThrow('inválidas');
    expect(() => resolveRange('2024-01-01', '2026-01-01')).toThrow('máximo');
  });
});
