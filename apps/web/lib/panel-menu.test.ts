import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { activeHref, ALL_LINKS } from './panel-menu';

describe('menu do painel', () => {
  it('cada link aponta para uma tela que existe e aparece uma vez só', () => {
    const hrefs = ALL_LINKS.map(item => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) expect(existsSync(join(__dirname, '../app/admin/(painel)', href.replace(/^\/painel/, ''), 'page.tsx')), href).toBe(true);
  });

  it('marca o link mais específico como ativo', () => {
    expect(activeHref('/painel')).toBe('/painel');
    expect(activeHref('/painel/pedidos/abc')).toBe('/painel/pedidos');
    expect(activeHref('/painel/estoque/depositos')).toBe('/painel/estoque/depositos');
    expect(activeHref('/painel/site/temas/123')).toBe('/painel/site');
    expect(activeHref('/painel/site')).toBe('/painel/site');
    expect(activeHref('/painel/midia')).toBeNull();
  });
});
