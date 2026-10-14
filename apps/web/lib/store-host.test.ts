import { describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
const { isDefaultHost, normalizeHost } = await import('./store-host');

describe('domínio da requisição', () => {
  it('normaliza host com porta, lista e maiúsculas', () => {
    expect(normalizeHost('Loja.Com.BR:443')).toBe('loja.com.br');
    expect(normalizeHost('a.com, b.com')).toBe('a.com');
    expect(normalizeHost(null)).toBe('');
  });

  it('serve a loja padrão em localhost, no domínio técnico do Render e no endereço oficial', () => {
    expect(isDefaultHost('localhost')).toBe(true);
    expect(isDefaultHost('storeos-web.onrender.com')).toBe(true);
    expect(isDefaultHost('', 'https://x.com')).toBe(true);
    expect(isDefaultHost('x.com', 'https://x.com')).toBe(true);
  });

  it('consulta a API para qualquer outro domínio', () => {
    expect(isDefaultHost('outra-loja.com.br', 'https://x.com')).toBe(false);
  });
});
