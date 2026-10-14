import { resolveJwtSecret } from './jwt-secret';

describe('resolveJwtSecret', () => {
  const strong = 'x'.repeat(64);

  it('usa o segredo configurado', () => {
    expect(resolveJwtSecret({ NODE_ENV: 'production', JWT_ACCESS_SECRET: strong })).toBe(strong);
  });

  it('impede a API de subir em produção sem segredo forte', () => {
    expect(() => resolveJwtSecret({ NODE_ENV: 'production' })).toThrow();
    expect(() => resolveJwtSecret({ NODE_ENV: 'production', JWT_ACCESS_SECRET: 'curto' })).toThrow();
  });

  it('usa um segredo local em desenvolvimento', () => {
    expect(resolveJwtSecret({ NODE_ENV: 'development' })).toBeTruthy();
  });
});
