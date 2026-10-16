import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ThemeDocument, ThemeReleaseManifest } from '@storeos/contracts';
import { validateThemeDocument } from '@storeos/contracts';
import { compareVersions, upgradeThemeDocument } from './theme-upgrade';

function manifests() {
  const read = (folder: string) => readFileSync(join(__dirname, '../../../prisma/migrations', folder, 'migration.sql'), 'utf8');
  const all = [...read('20261016030000_theme_engine_foundation').matchAll(/\$json\$(\{.*?\})\$json\$/gs), ...read('20261016180000_theme_catalog').matchAll(/\$json\$(\{.*?\})\$json\$/gs), ...read('20261016190000_theme_enterprise').matchAll(/\$json\$(\{.*?\})\$json\$/gs)]
    .map(match => JSON.parse(match[1]) as ThemeReleaseManifest);
  const find = (slug: string, version: string) => all.find(item => item.slug === slug && item.version === version)!;
  return { v10: find('storeos-editorial', '1.0.0'), v11: find('storeos-editorial', '1.1.0'), all };
}

describe('atualização de versão do tema', () => {
  it('ordena versões', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.1.0', '1.1')).toBe(0);
    expect(compareVersions('1.0.0', '1.1.0')).toBeLessThan(0);
  });

  it('todos os temas do catálogo têm layout inicial válido', () => {
    for (const manifest of manifests().all) expect(validateThemeDocument(manifest.defaultDocument, manifest)).toEqual([]);
  });

  it('leva o rascunho para a 1.1 mantendo cores, textos e ordem e preenchendo os campos novos', () => {
    const { v10, v11 } = manifests();
    const draft: ThemeDocument = structuredClone(v10.defaultDocument);
    draft.global.designTokens.colors = { primary: '#123456', background: '#FFFFFF', text: '#000000' };
    const home = draft.templates.home!;
    home.sections.reverse();
    home.sections.find(section => section.type === 'storeos.hero.v1')!.settings.title = 'Meu banner';
    home.sections.find(section => section.type === 'storeos.footer.v1')!.enabled = true;
    draft.templates.page!.sections.find(section => section.type === 'storeos.content-page.v1')!.settings.body = 'texto antigo';
    delete draft.templates['not-found'];

    const upgraded = upgradeThemeDocument(draft, v11);
    expect(validateThemeDocument(upgraded, v11)).toEqual([]);
    expect(upgraded.themeRelease).toBe('storeos-editorial@1.1.0');
    expect(upgraded.global.designTokens.colors?.primary).toBe('#123456');
    expect(upgraded.templates.home!.sections.map(section => section.id)).toEqual(home.sections.map(section => section.id));
    const hero = upgraded.templates.home!.sections.find(section => section.type === 'storeos.hero.v1')!;
    expect(hero.settings).toMatchObject({ title: 'Meu banner', visibility: 'all', mobileAlign: 'left' });
    expect(upgraded.templates.home!.sections.find(section => section.type === 'storeos.product-collection.v1')!.settings).toMatchObject({ columns: 4, mobileColumns: 2 });
    // Campo que não existe mais sai; o novo vem do padrão.
    expect(upgraded.templates.page!.sections.find(section => section.type === 'storeos.content-page.v1')!.settings).toEqual({ width: 'narrow', showTitle: true, showUpdatedAt: false });
    // Página que faltava entra com o layout inicial da versão nova.
    expect(upgraded.templates['not-found']).toEqual(v11.defaultDocument.templates['not-found']);
  });
});
