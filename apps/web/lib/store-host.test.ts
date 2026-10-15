import { describe, expect, it } from 'vitest';
import { platformSlug } from './store-host';

describe('subdomínio da plataforma', () => {
  it('extrai o slug só do domínio-base configurado', () => {
    expect(platformSlug('vivi.lojas.exemplo.com.br', 'lojas.exemplo.com.br')).toBe('vivi');
    expect(platformSlug('vivi-moda.lojas.exemplo.com.br', 'lojas.exemplo.com.br')).toBe('vivi-moda');
  });
  it('rejeita domínio de fora, níveis extras, rótulos inválidos e recurso desligado', () => {
    expect(platformSlug('vivi.outro.com.br', 'lojas.exemplo.com.br')).toBeNull();
    expect(platformSlug('a.b.lojas.exemplo.com.br', 'lojas.exemplo.com.br')).toBeNull();
    expect(platformSlug('-vivi.lojas.exemplo.com.br', 'lojas.exemplo.com.br')).toBeNull();
    expect(platformSlug('lojas.exemplo.com.br', 'lojas.exemplo.com.br')).toBeNull();
    expect(platformSlug('vivi.lojas.exemplo.com.br', '')).toBeNull();
    expect(platformSlug('www.lojas.exemplo.com.br', 'lojas.exemplo.com.br')).toBeNull();
    expect(platformSlug('mail.lojas.exemplo.com.br', 'lojas.exemplo.com.br')).toBeNull();
  });
});
