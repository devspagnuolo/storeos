import { formatNcm, gtinChecksumOk, normalizeCest, normalizeGtin, normalizeNcm, normalizeOrigin, normalizeUnit } from './fiscal-rules';

describe('fiscal-rules', () => {
  it('normaliza NCM e CEST', () => {
    expect(normalizeNcm('6109.10.00')).toBe('61091000');
    expect(normalizeNcm('1234')).toBeUndefined();
    expect(normalizeNcm('00000000')).toBeUndefined();
    expect(formatNcm('61091000')).toBe('6109.10.00');
    expect(normalizeCest('28.038.00')).toBe('2803800');
    expect(normalizeCest('12')).toBeUndefined();
  });
  it('valida GTIN pelo dígito verificador', () => {
    expect(gtinChecksumOk('7891000100103')).toBe(true);
    expect(normalizeGtin('789 1000 100103')).toBe('7891000100103');
    expect(normalizeGtin('7891000100104')).toBeUndefined();
    expect(normalizeGtin('SEM GTIN')).toBeUndefined();
    expect(normalizeGtin('00000000')).toBeUndefined();
  });
  it('aceita origem de 0 a 8 e limpa unidade', () => {
    expect(normalizeOrigin('0')).toBe(0);
    expect(normalizeOrigin(8)).toBe(8);
    expect(normalizeOrigin(9)).toBeUndefined();
    expect(normalizeOrigin('')).toBeUndefined();
    expect(normalizeUnit(' un ')).toBe('UN');
  });
});
