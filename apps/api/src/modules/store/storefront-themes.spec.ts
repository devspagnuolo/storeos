import { READY_THEMES, buildThemeConfig, findReadyTheme } from './storefront-themes';

describe('temas prontos', () => {
  it('têm chaves únicas e passam pelo saneamento da vitrine', () => {
    expect(new Set(READY_THEMES.map(theme => theme.key)).size).toBe(READY_THEMES.length);
    for (const theme of READY_THEMES) {
      const config = buildThemeConfig(theme, 'Vivi Moda', null);
      expect(config.home?.sections.length).toBeGreaterThan(3);
      expect(config.design?.preset).toBeDefined();
    }
  });

  it('troca {loja} pelo nome e não deixa o token no resultado', () => {
    const config = buildThemeConfig(findReadyTheme('elegante')!, 'Vivi Moda', null);
    expect(JSON.stringify(config)).not.toContain('{loja}');
    expect(JSON.stringify(config)).toContain('Vivi Moda');
  });

  it('preserva logo e favicon atuais', () => {
    const config = buildThemeConfig(findReadyTheme('essencial')!, 'Loja', { design: { logoUrl: 'https://cdn.exemplo.com/logo.png', faviconUrl: 'https://cdn.exemplo.com/f.png' } });
    expect(config.design?.logoUrl).toBe('https://cdn.exemplo.com/logo.png');
    expect(config.design?.faviconUrl).toBe('https://cdn.exemplo.com/f.png');
  });

  it('usa nome padrão quando a loja não tem nome', () => {
    expect(JSON.stringify(buildThemeConfig(READY_THEMES[0], '  ', null))).toContain('nossa loja');
  });
});
