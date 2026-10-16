import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ThemeReleaseManifest } from '@storeos/contracts';
import { legacyToEngineDocument } from './legacy-to-engine';
import { settingsIssues } from './theme-engine.service';
import { READY_THEMES } from './storefront-themes';
import type { StorefrontConfig } from './storefront-config';

const mine = [...readFileSync(join(__dirname, '../../../prisma/migrations/20261016200000_theme_unified_editor/migration.sql'), 'utf8').matchAll(/\$json\$(\{.*?\})\$json\$/gs)]
  .map(match => JSON.parse(match[1]) as ThemeReleaseManifest)
  .find(manifest => manifest.slug === 'storeos-minha-loja')!;

describe('loja do editor clássico no editor de temas', () => {
  it('converte visual, banners e seções mantendo ordem, textos e seções ocultas', () => {
    const config: StorefrontConfig = {
      accentColor: '#9D174D',
      announcementText: 'Frete grátis na {loja}',
      design: { preset: 'minimalista', font: 'serif', buttonRadius: 'none', containerWidth: 'wide', spacing: 'relaxed', backgroundColor: '#FFFBF7', textColor: '#1F1720' },
      home: { sections: [
        { id: 'banners', type: 'banners', hidden: false, props: {} },
        { id: 'destaque', type: 'hero', hidden: false, props: { title: 'Bem-vinda à {loja}', description: 'Moda plus size', cta: 'Comprar', ctaHref: '/categorias', imageUrl: 'https://cdn.exemplo.com/h.jpg', layout: 'centered' } },
        { id: 'vestidos', type: 'products', hidden: false, props: { heading: 'Vestidos', subheading: '', limit: 30, categorySlug: 'vestidos', productIds: [], columns: '5' } },
        { id: 'vantagens', type: 'benefits', hidden: true, props: { items: [{ title: 'Pague com PIX', text: 'Aprovação na hora.' }, { title: 'Troca facilitada', text: '' }] } },
        { id: 'video', type: 'video', hidden: false, props: { provider: 'youtube', videoId: 'dQw4w9WgXcQ', title: 'Bastidores' } },
        { id: 'texto', type: 'text', hidden: false, props: { heading: 'Sobre', body: 'x'.repeat(1800), align: 'center' } },
        { id: 'header', type: 'newsletter', hidden: false, props: { heading: 'Novidades', text: 'Cadastre-se' } },
      ] },
    };
    const document = legacyToEngineDocument(config, mine, { storeName: 'Vivi', banners: [{ imageUrl: '/uploads/b1.jpg', title: 'Coleção', linkUrl: 'javascript:alert(1)' }, { imageUrl: 'http://inseguro/b.jpg' }] });
    expect(settingsIssues(document, mine)).toEqual([]);
    expect(document.global.designTokens).toEqual({ colors: { primary: '#9D174D', background: '#FFFBF7', text: '#1F1720' }, typography: { fontFamily: 'serif' }, spacing: { section: '64px' }, shape: { buttonRadius: '0px' } });
    expect(document.global.settings).toMatchObject({ showAnnouncement: true, announcementText: 'Frete grátis na Vivi' });
    const home = document.templates.home!.sections;
    expect(home.map(section => section.type)).toEqual(['storeos.announcement.v1', 'storeos.header.v1', 'storeos.carousel.v1', 'storeos.hero.v1', 'storeos.product-collection.v1', 'storeos.benefits.v1', 'storeos.video.v1', 'storeos.rich-text.v1', 'storeos.newsletter.v1', 'storeos.footer.v1']);
    expect(home[2].blocks).toHaveLength(1);
    expect(home[2].blocks[0].settings).toMatchObject({ imageUrl: '/uploads/b1.jpg', title: 'Coleção', ctaUrl: '' });
    expect(home[3].settings).toMatchObject({ title: 'Bem-vinda à Vivi', mobileAlign: 'center' });
    expect(home[4].settings).toMatchObject({ limit: 24, columns: 5, sourceUrl: '/categorias/vestidos', showViewAll: true });
    expect(home[5]).toMatchObject({ enabled: false });
    expect(home[5].blocks.map(block => block.settings.icon)).toEqual(['pix', 'return']);
    expect(home[6].settings.videoUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(String(home[7].settings.body)).toHaveLength(1500);
    expect(home[8].id).toBe('header-2');
    expect(document.templates.landing!.sections).toHaveLength(home.length);
  });

  it('loja sem seções usa o destaque antigo e pula banners quando não há imagens', () => {
    const document = legacyToEngineDocument({ heroTitle: 'Olá', heroDescription: 'Bem-vinda' }, mine, { storeName: 'Vivi' });
    expect(settingsIssues(document, mine)).toEqual([]);
    expect(document.templates.home!.sections.map(section => section.type)).toEqual(['storeos.announcement.v1', 'storeos.header.v1', 'storeos.hero.v1', 'storeos.category-grid.v1', 'storeos.product-collection.v1', 'storeos.footer.v1']);
    expect(document.global.settings.showAnnouncement).toBe(false);
  });

  it('todos os temas prontos viram documentos válidos', () => {
    for (const theme of READY_THEMES) expect([theme.key, settingsIssues(legacyToEngineDocument(theme.config, mine, { storeName: 'Loja' }), mine)]).toEqual([theme.key, []]);
  });
});
