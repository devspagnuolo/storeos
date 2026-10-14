import { toCsv } from './stock-ledger';

describe('toCsv', () => {
  it('escapa aspas, separadores e quebras de linha', () => {
    expect(toCsv([['a', 'b;c', 'd"e', 'f\ng']])).toBe('﻿a;"b;c";"d""e";"f\ng"\r\n');
  });
  it('neutraliza fórmulas mas preserva números negativos', () => {
    expect(toCsv([['=SOMA(A1)', -3, '+55 11']])).toBe("﻿'=SOMA(A1);-3;'+55 11\r\n");
  });
});
