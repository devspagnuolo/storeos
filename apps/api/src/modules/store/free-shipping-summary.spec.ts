import { Prisma } from '@prisma/client';
import { freeShippingSummary } from './store.controller';

const rule = (freeAbove: string | null, states: string[] = []) => ({ states, freeAbove: freeAbove === null ? null : new Prisma.Decimal(freeAbove) });

describe('freeShippingSummary', () => {
  it('sem regra com frete grátis não mostra nada', () => {
    expect(freeShippingSummary([])).toBeNull();
    expect(freeShippingSummary([rule(null)])).toBeNull();
  });

  it('usa o menor valor entre as regras de todo o Brasil', () => {
    expect(freeShippingSummary([rule('399'), rule('299.9'), rule('99', ['SP'])])).toEqual({ from: '299.90', nationwide: true });
  });

  it('só regras regionais: avisa que vale para algumas regiões', () => {
    expect(freeShippingSummary([rule('199', ['SP']), rule('149', ['RJ'])])).toEqual({ from: '149.00', nationwide: false });
  });
});
