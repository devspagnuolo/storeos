import { ThemeReleaseManifest, validateThemeDocument } from '@storeos/contracts';

const manifest: ThemeReleaseManifest = {
  id: 'theme-starter',
  slug: 'starter',
  version: '1.0.0',
  displayName: 'Starter',
  author: { name: 'STOREOS' },
  license: 'STOREOS',
  minRuntimeVersion: '1.0.0',
  manifestVersion: 1,
  templates: [{ pageType: 'home', title: 'Início', required: true }],
  sections: [{
    type: 'storeos.hero.v1',
    title: 'Banner principal',
    description: 'Hero da página inicial',
    allowedPageTypes: ['home'],
    maxBlocks: 4,
    settingsSchema: {},
    blockTypes: ['slide'],
  }],
  globalSettingsSchema: {},
  defaultDocument: {
    schemaVersion: 1,
    themeRelease: 'starter@1.0.0',
    templates: { home: { sections: [{ id: 'hero-1', type: 'storeos.hero.v1', enabled: true, settings: {}, blocks: [] }] } },
    global: { designTokens: {}, settings: {} },
  },
  assets: [],
};

describe('validateThemeDocument', () => {
  it('accepts a valid declarative page document', () => {
    expect(validateThemeDocument(manifest.defaultDocument, manifest)).toEqual([]);
  });

  it('rejects mismatched releases, duplicate section IDs and unsafe URLs', () => {
    const invalid = {
      ...manifest.defaultDocument,
      themeRelease: 'other@9.9.9',
      templates: {
        home: {
          sections: [
            { ...manifest.defaultDocument.templates.home!.sections[0], settings: { imageUrl: 'javascript:alert(1)' } },
            { ...manifest.defaultDocument.templates.home!.sections[0] },
          ],
        },
      },
    };
    const issues = validateThemeDocument(invalid, manifest);
    expect(issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['RELEASE_MISMATCH', 'DUPLICATE_ID', 'UNSAFE_URL']));
  });

  it('rejects executable markup properties and oversized documents', () => {
    const dangerous = {
      ...manifest.defaultDocument,
      global: { ...manifest.defaultDocument.global, settings: { script: 'alert(1)' } },
    };
    expect(validateThemeDocument(dangerous, manifest).some(issue => issue.code === 'UNSAFE_PROPERTY')).toBe(true);
    expect(validateThemeDocument({ content: 'x'.repeat(300_000) }, manifest).some(issue => issue.code === 'DOCUMENT_TOO_LARGE')).toBe(true);
  });
});
