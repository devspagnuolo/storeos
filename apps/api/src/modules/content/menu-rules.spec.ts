import { normalizeMenu, resolveMenu, isSafeLink } from './menu-rules';

const targets = { categories: new Set(['blusas']), collections: new Set<string>(), brands: new Set<string>(), pages: new Set(['trocas']) };

describe('normalizeMenu', () => {
  it('aceita categoria com subitens e limpa campos extras', () => {
    const menu = normalizeMenu([{ label: ' Blusas ', type: 'CATEGORY', ref: 'blusas', extra: 1, children: [{ label: 'Regatas', type: 'CATEGORY', ref: 'regatas' }] }, { label: 'Tudo', type: 'ALL', ref: 'x' }]);
    expect(menu).toEqual([{ label: 'Blusas', type: 'CATEGORY', ref: 'blusas', children: [{ label: 'Regatas', type: 'CATEGORY', ref: 'regatas' }] }, { label: 'Tudo', type: 'ALL' }]);
  });
  it('aceita quatro níveis e recusa o quinto', () => {
    const leaf = { label: 'D', type: 'ALL' };
    const four = [{ label: 'A', type: 'ALL', children: [{ label: 'B', type: 'ALL', children: [{ label: 'C', type: 'ALL', children: [leaf] }] }] }];
    expect(normalizeMenu(four)).toHaveLength(1);
    expect(() => normalizeMenu([{ label: 'A', type: 'ALL', children: [{ label: 'B', type: 'ALL', children: [{ label: 'C', type: 'ALL', children: [{ ...leaf, children: [{ label: 'E', type: 'ALL' }] }] }] }] }])).toThrow('4 níveis');
  });
  it('recusa destino vazio, tipo inválido e links perigosos', () => {
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
