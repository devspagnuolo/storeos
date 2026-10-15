import { normalizePath, normalizeTarget, nuvemshopRedirects, parseRedirectCsv, validateFrom, wouldLoop } from './redirect-rules';

describe('redirecionamentos', () => {
  it('normaliza o endereço antigo', () => {
    expect(normalizePath('https://Loja.com.br/Produtos/Vestido-Azul/?utm=1#x')).toBe('/produtos/vestido-azul');
    expect(normalizePath('produtos//vestido/')).toBe('/produtos/vestido');
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('/produtos/vestido%20azul')).toBe('/produtos/vestido azul');
  });
  it('aceita só destino da loja ou https', () => {
    expect(normalizeTarget('produto/vestido/')).toEqual({ ok: true, to: '/produto/vestido' });
    expect(normalizeTarget('/busca?q=azul')).toEqual({ ok: true, to: '/busca?q=azul' });
    expect(normalizeTarget('https://outra.com/x')).toEqual({ ok: true, to: 'https://outra.com/x' });
    expect(normalizeTarget('javascript:alert(1)')).toMatchObject({ ok: false });
    expect(normalizeTarget('//evil.com')).toMatchObject({ ok: false });
    expect(normalizeTarget('http://inseguro.com')).toMatchObject({ ok: false });
    expect(normalizeTarget('  ')).toMatchObject({ ok: false });
  });
  it('protege os endereços da própria loja', () => {
    expect(validateFrom('/')).toMatch(/inicial/);
    expect(validateFrom('/painel/pedidos')).toMatch(/já é um endereço/);
    expect(validateFrom('/produto/x')).toMatch(/já é um endereço/);
    expect(validateFrom('/produtos/x')).toBeNull();
  });
  it('detecta ciclos', () => {
    const existing = new Map([['/b', '/c'], ['/c', '/a']]);
    expect(wouldLoop('/a', '/b', existing)).toBe(true);
    expect(wouldLoop('/a', '/a', new Map())).toBe(true);
    expect(wouldLoop('/a', '/z', existing)).toBe(false);
  });
  it('lê planilha com cabeçalho opcional e aponta linhas ruins', () => {
    const out = parseRedirectCsv('antigo;novo\n/produtos/a;/produto/a\n"/produtos/b","/produto/b"\n/so-uma-coluna\n\n');
    expect(out.rows).toEqual([{ line: 2, from: '/produtos/a', to: '/produto/a' }, { line: 3, from: '/produtos/b', to: '/produto/b' }]);
    expect(out.errors).toEqual([{ line: 4, error: expect.stringContaining('duas colunas') }]);
  });
  it('sugere os endereços da Nuvemshop', () => {
    expect(nuvemshopRedirects([{ slug: 'vestido' }], [{ slug: 'vestidos' }, { slug: 'carrinho' }, { slug: 'produtos' }])).toEqual([
      { from: '/produtos/vestido', to: '/produto/vestido' }, { from: '/vestidos', to: '/categorias/vestidos' },
    ]);
  });
});
