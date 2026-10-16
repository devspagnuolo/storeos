import { describe, expect, it } from 'vitest';
import { diffThemeDocuments, type DiffDocument, type DiffManifest } from './theme-diff';

const manifest: DiffManifest = {
  sections: [
    { type: 'storeos.hero.v1', title: 'Banner principal', settingsSchema: { properties: { title: { title: 'Título' }, show: { title: 'Mostrar' } } } },
    { type: 'storeos.footer.v1', title: 'Rodapé', settingsSchema: { properties: {} } },
  ],
  globalSettingsSchema: { properties: { footerNote: { title: 'Texto legal do rodapé' } } },
};
const base = (): DiffDocument => ({
  templates: { home: { sections: [
    { id: 'hero', type: 'storeos.hero.v1', enabled: true, settings: { title: 'Antes', show: true }, blocks: [] },
    { id: 'footer', type: 'storeos.footer.v1', enabled: true, settings: {}, blocks: [] },
  ] } },
  global: { designTokens: { colors: { primary: '#111111' }, typography: { fontFamily: 'system' } }, settings: { footerNote: '' } },
});
const title = (pageType: string) => (pageType === 'home' ? 'Página inicial' : pageType);

describe('diffThemeDocuments', () => {
  it('não vê mudança em documentos iguais', () => {
    expect(diffThemeDocuments(base(), base(), manifest, title)).toEqual([]);
  });

  it('descreve cores, fonte, textos, visibilidade, ordem e seções novas em português', () => {
    const after = base();
    after.global.designTokens.colors!.primary = '#222222';
    after.global.designTokens.typography!.fontFamily = 'serif';
    after.global.settings.footerNote = 'CNPJ 00';
    const [hero, footer] = after.templates.home!.sections;
    hero.settings.title = 'Depois';
    hero.settings.show = false;
    footer.enabled = false;
    after.templates.home!.sections = [footer, hero, { id: 'hero-2', type: 'storeos.hero.v1', enabled: true, settings: {}, blocks: [] }];
    const texts = diffThemeDocuments(base(), after, manifest, title).map(change => `${change.area} | ${change.text}`);
    expect(texts).toEqual([
      'Cores, fonte e marca | Cor principal mudou de “#111111” para “#222222”',
      'Cores, fonte e marca | Fonte mudou de Padrão do sistema para Serifada',
      'Preferências do tema | Texto legal do rodapé mudou de vazio para “CNPJ 00”',
      'Página inicial | Seção “Banner principal” adicionada',
      'Página inicial | Ordem das seções mudou',
      'Página inicial | Seção “Rodapé” foi ocultada',
      'Página inicial | Banner principal: Título mudou de “Antes” para “Depois”',
      'Página inicial | Banner principal: Mostrar mudou de ligado para desligado',
    ]);
  });

  it('avisa quando uma seção some', () => {
    const after = base();
    after.templates.home!.sections = after.templates.home!.sections.slice(1);
    expect(diffThemeDocuments(base(), after, manifest, title)).toEqual([{ area: 'Página inicial', text: 'Seção “Banner principal” removida' }]);
  });
});
