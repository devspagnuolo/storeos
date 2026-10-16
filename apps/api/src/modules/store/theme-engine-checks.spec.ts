import type { ThemeDocument } from '@storeos/contracts';
import { contrast, themeChecks } from './theme-engine-checks';

const doc = (overrides: Partial<ThemeDocument['global']['designTokens']['colors']> = {}, hero: Record<string, unknown> = { title: 'Olá' }): ThemeDocument => ({
  schemaVersion: 1, themeRelease: 't@1.0.0',
  global: { designTokens: { colors: { text: '#0F172A', background: '#FFFFFF', primary: '#6D28D9', ...overrides } }, settings: { showAnnouncement: false } },
  templates: { home: { sections: [{ id: 'h', type: 'storeos.hero.v1', enabled: true, settings: hero, blocks: [] }] } },
} as ThemeDocument);

describe('themeChecks', () => {
  it('não avisa nada num tema correto', () => expect(themeChecks(doc())).toEqual([]));
  it('avisa contraste baixo e banner sem título ou sem link', () => {
    const checks = themeChecks(doc({ text: '#CCCCCC' }, { title: '', ctaLabel: 'Comprar' }));
    expect(checks.map(c => c.area)).toEqual(expect.arrayContaining(['accessibility', 'seo', 'content']));
  });
  it('calcula contraste WCAG', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBe(1);
  });
});
