import { normalizeMenu, resolveMenu, isSafeLink } from './menu-rules';

const targets = { categories: new Set(['blusas']), collections: new Set<string>(), brands: new Set<string>(), pages: new Set(['trocas']) };

describe('normalizeMenu', () => {
  it('aceita categoria com subitens e limpa campos extras', () => {
    const menu = normalizeMenu([{ label: ' Blusas ', type: 'CATEGORY', ref: 'blusas', extra: 1, children: [{ label: 'Regatas', type: 'CATEGORY', ref: 'regatas' }] }, { label: 'Tudo', type: 'ALL', ref: 'x' }]);
    expect(menu).toEqual([{ label: 'Blusas', type: 'CATEGORY', ref: 'blusas', children: [{ label: 'Regatas', type: 'CATEGORY', ref: 'regatas' }] }, { label: 'Tudo', type: 'ALL' }]);
  });
  it('recusa três níveis, destino vazio, tipo inválido e links perigosos', () => {
    expect(() => normalizeMenu([{ label: 'A', type: 'CATEGORY', ref: 'a', children: [{ label: 'B', type: 'CATEGORY', ref: 'b', children: [{ label: 'C', type: 'ALL' }] }] }])).toThrow('dois níveis');
    expect(() => normalizeMenu([{ label: 'A', type: 'CATEGORY' }])).toThrow('destino');
    expect(() => normalizeMenu([{ label: 'A', type: 'X' }])).toThrow('Tipo inválido');
    expect(() => normalizeMenu([{ label: 'A', type: 'LINK', ref: 'javascript:alert(1)' }])).toThrow('link');
    expect(() => normalizeMenu([{ label: '', type: 'ALL' }])).toThrow('nome');
    expect(() => normalizeMenu('x')).toThrow('inválido');
  });
  it('isSafeLink só aceita caminho interno ou https', () => {
    expect(isSafeLink('/p/trocas')).toBe(true);
    expect(isSafeLink('https://wa.me/5511')).toBe(true);
    expect(isSafeLink('//evil.com')).toBe(false);
    expect(isSafeLink('http://x.com')).toBe(false);
  });
});

describe('resolveMenu', () => {
  it('gera os endereços e remove destinos que não existem mais', () => {
    const menu = normalizeMenu([
      { label: 'Blusas', type: 'CATEGORY', ref: 'blusas', children: [{ label: 'Sumida', type: 'CATEGORY', ref: 'sumida' }] },
      { label: 'Trocas', type: 'PAGE', ref: 'trocas' }, { label: 'Fora', type: 'PAGE', ref: 'apagada' }, { label: 'Zap', type: 'LINK', ref: 'https://wa.me/55' },
    ]);
    expect(resolveMenu(menu, targets)).toEqual([
      { label: 'Blusas', href: '/categorias/blusas', children: [] },
      { label: 'Trocas', href: '/p/trocas', children: [] },
      { label: 'Zap', href: 'https://wa.me/55', children: [] },
    ]);
  });
});
