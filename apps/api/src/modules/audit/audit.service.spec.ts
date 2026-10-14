import { boundedMetadata, redact } from './audit.service';

describe('redact', () => {
  it('oculta segredos em qualquer nível e mantém o restante', () => {
    const result = redact({ name: 'Loja', password: 'x', nested: { refreshToken: 'abc', list: [{ cardNumber: '4111', ok: 1 }] } });
    expect(result).toEqual({ name: 'Loja', password: '[oculto]', nested: { refreshToken: '[oculto]', list: [{ cardNumber: '[oculto]', ok: 1 }] } });
  });

  it('corta textos longos e estruturas muito profundas', () => {
    expect((redact('a'.repeat(900)) as string).length).toBe(501);
    expect(JSON.stringify(redact({ a: { b: { c: { d: { e: { f: 1 } } } } } }))).toContain('profundo demais');
  });

  it('descarta metadados grandes demais em vez de gravar tudo', () => {
    expect(boundedMetadata({ body: Array.from({ length: 50 }, (_, i) => ({ i, texto: 'x'.repeat(400) })) })).toEqual({ truncado: true });
    expect(boundedMetadata(undefined)).toBeUndefined();
  });
});
