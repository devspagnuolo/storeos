import { averageDaysBetween, buildTimeline, daysSince, toCsv } from './customer-insights';

describe('customer-insights', () => {
  it('ordena a linha do tempo do mais recente ao mais antigo', () => {
    const t = buildTimeline([{ at: new Date('2026-01-01'), kind: 'ORDER', title: 'a' }, { at: new Date('2026-03-01'), kind: 'EMAIL', title: 'b' }]);
    expect(t.map(e => e.title)).toEqual(['b', 'a']);
  });
  it('calcula intervalo médio entre compras', () => {
    expect(averageDaysBetween([new Date('2026-01-01')])).toBeNull();
    expect(averageDaysBetween([new Date('2026-01-31'), new Date('2026-01-01'), new Date('2026-03-02')])).toBe(30);
  });
  it('conta dias desde a última compra', () => {
    expect(daysSince(null)).toBeNull();
    expect(daysSince(new Date('2026-01-01'), new Date('2026-01-11T12:00:00Z'))).toBe(10);
  });
  it('gera CSV com BOM, escapa e neutraliza fórmulas', () => {
    const csv = toCsv([['Nome', 'Obs'], ['=cmd', 'a;b"c']]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain("'=cmd;\"a;b\"\"c\"");
  });
});
