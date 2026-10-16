import type { ThemeDesignTokens, ThemeDocument, ThemeJsonValue, ThemeReleaseManifest, ThemeSectionInstance } from '@storeos/contracts';
import type { StorefrontConfig } from './storefront-config';
import type { HomeSection } from './storefront-sections';

/**
 * Converte o visual e as seções do editor clássico ("Personalizar loja") para um documento do editor de temas.
 * Usado para levar os temas prontos e a loja atual para o mesmo editor. Nunca publica nada.
 */
export type LegacyBanner = { imageUrl: string; mobileImageUrl?: string | null; title?: string | null; subtitle?: string | null; ctaLabel?: string | null; linkUrl?: string | null };
export type LegacyConversionOptions = { storeName?: string; banners?: LegacyBanner[] };

const RADIUS: Record<string, string> = { none: '0px', sm: '4px', md: '8px', full: '9999px' };
const SPACING: Record<string, string> = { compact: '32px', normal: '48px', relaxed: '64px' };
const HEX = /^#[0-9a-f]{6}$/i;
const ENGINE_ID = /^[a-zA-Z0-9_-]{1,96}$/;
const MAX_SECTIONS = 30;

const cut = (value: unknown, max: number) => (typeof value === 'string' ? value : '').trim().slice(0, max);
/** Endereço aceito pelo editor de temas: https ou caminho da própria loja. */
const link = (value: unknown, fallback = '') => {
  const url = cut(value, 500);
  return /^https:\/\//i.test(url) || (url.startsWith('/') && !url.startsWith('//')) ? url : fallback;
};

export function legacyDesignTokens(config: StorefrontConfig): ThemeDesignTokens {
  const design = config.design ?? {} as NonNullable<StorefrontConfig['design']>;
  const dark = design.mode === 'dark';
  const primary = HEX.test(config.accentColor ?? '') ? config.accentColor! : '#6D28D9';
  const background = HEX.test(design.backgroundColor ?? '') ? design.backgroundColor! : dark ? '#0A0A0B' : '#FFFFFF';
  const text = HEX.test(design.textColor ?? '') ? design.textColor! : dark ? '#F4F4F5' : '#0F172A';
  const serif = design.font === 'serif' || design.headingFont === 'serif';
  return {
    colors: { primary, background, text },
    typography: { fontFamily: serif ? 'serif' : 'sans-serif' },
    spacing: { section: SPACING[design.spacing ?? 'normal'] ?? '48px' },
    shape: { buttonRadius: RADIUS[design.buttonRadius ?? 'md'] ?? '8px' },
  };
}

function benefitIcon(title: string) {
  const value = title.toLowerCase();
  if (/frete|entrega|envio/.test(value)) return 'truck';
  if (/pix/.test(value)) return 'pix';
  if (/ponto|cashback|fidelidade/.test(value)) return 'points';
  if (/troca|devolu/.test(value)) return 'return';
  if (/segur|protegid/.test(value)) return 'shield';
  if (/parcel|cart[aã]o|juros/.test(value)) return 'card';
  if (/embal|presente/.test(value)) return 'gift';
  if (/atendimento|whats|fale/.test(value)) return 'chat';
  return 'star';
}

function videoUrl(props: Record<string, unknown>) {
  const id = cut(props.videoId, 40);
  if (props.provider === 'youtube' && /^[\w-]{11}$/.test(id)) return `https://www.youtube.com/watch?v=${id}`;
  if (props.provider === 'vimeo' && /^\d+$/.test(id)) return `https://vimeo.com/${id}`;
  return '';
}

/** Uma seção do editor clássico vira zero ou uma seção do editor de temas. */
function convertSection(section: HomeSection, id: string, options: LegacyConversionOptions, replace: (value: string) => string): Omit<ThemeSectionInstance, 'id' | 'enabled'> | null {
  const props = section.props ?? {};
  const t = (value: unknown, max: number) => replace(cut(value, 400)).slice(0, max);
  const all = { visibility: 'all' };
  const blocks = (type: string, list: Record<string, ThemeJsonValue>[]) => list.map((settings, index) => ({ id: `${id}-${index + 1}`, type, enabled: true, settings }));
  switch (section.type) {
    case 'banners': {
      const slides = (options.banners ?? []).filter(banner => link(banner.imageUrl)).slice(0, 6);
      if (!slides.length) return null;
      return { type: 'storeos.carousel.v1', settings: { autoplay: true, interval: 6, height: 'large', ...all }, blocks: blocks('storeos.carousel.slide.v1', slides.map(banner => ({
        imageUrl: link(banner.imageUrl), mobileImageUrl: link(banner.mobileImageUrl), title: t(banner.title, 80), subtitle: t(banner.subtitle, 160),
        ctaLabel: t(banner.ctaLabel, 30), ctaUrl: link(banner.linkUrl), textTone: 'dark',
      }))) };
    }
    case 'hero':
      return { type: 'storeos.hero.v1', settings: {
        eyebrow: '', title: t(props.title, 100), subtitle: t(props.description, 240), ctaLabel: t(props.cta, 40), ctaUrl: link(props.ctaHref, '/categorias'),
        imageUrl: link(props.imageUrl), mobileImageUrl: '', ...all, mobileAlign: props.layout === 'centered' ? 'center' : 'left',
      }, blocks: [] };
    case 'image': {
      if (!link(props.imageUrl)) return null;
      return { type: 'storeos.image.v1', settings: { heading: '', columns: 1, ...all }, blocks: blocks('storeos.image.tile.v1', [{ imageUrl: link(props.imageUrl), alt: t(props.alt, 120), label: '', linkUrl: link(props.href) }]) };
    }
    case 'carousel': {
      const slides = (Array.isArray(props.slides) ? props.slides as Record<string, unknown>[] : []).filter(slide => link(slide.imageUrl)).slice(0, 6);
      if (!slides.length) return null;
      return { type: 'storeos.carousel.v1', settings: { autoplay: props.autoplay !== false, interval: 6, height: 'large', ...all }, blocks: blocks('storeos.carousel.slide.v1', slides.map(slide => ({
        imageUrl: link(slide.imageUrl), mobileImageUrl: '', title: '', subtitle: '', ctaLabel: '', ctaUrl: link(slide.href), textTone: 'dark',
      }))) };
    }
    case 'text':
      return { type: 'storeos.rich-text.v1', settings: { heading: t(props.heading, 100), body: replace(cut(props.body, 2000)).slice(0, 1500), align: props.align === 'center' ? 'center' : 'left', ...all }, blocks: [] };
    case 'categories': {
      const limit = typeof props.limit === 'number' ? props.limit : 6;
      return { type: 'storeos.category-grid.v1', settings: { heading: t(props.heading, 80), subheading: '', columns: Math.min(6, Math.max(2, limit)), mobileColumns: props.layout === 'circles' ? 3 : 2, ...all }, blocks: [] };
    }
    case 'products': {
      const slug = cut(props.categorySlug, 120);
      const columns = Number(props.columns ?? 4);
      return { type: 'storeos.product-collection.v1', settings: {
        heading: t(props.heading, 80), subheading: t(props.subheading, 80), limit: typeof props.limit === 'number' ? Math.min(24, Math.max(1, props.limit)) : 8,
        columns: Number.isInteger(columns) && columns >= 2 && columns <= 6 ? columns : 4, mobileColumns: 2, ...all,
        sourceUrl: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? `/categorias/${slug}` : '', showViewAll: Boolean(slug),
      }, blocks: [] };
    }
    case 'benefits': {
      const list = (Array.isArray(props.items) ? props.items as Record<string, unknown>[] : []).filter(item => cut(item.title, 60)).slice(0, 6);
      if (!list.length) return null;
      return { type: 'storeos.benefits.v1', settings: { style: 'bar', ...all }, blocks: blocks('storeos.benefits.item.v1', list.map(item => ({ icon: benefitIcon(cut(item.title, 60)), title: t(item.title, 40), text: t(item.text, 80) }))) };
    }
    case 'testimonials': {
      const list = (Array.isArray(props.items) ? props.items as Record<string, unknown>[] : []).filter(item => cut(item.text, 300)).slice(0, 9);
      return { type: 'storeos.testimonials.v1', settings: { heading: t(props.heading, 80), subheading: '', ...all }, blocks: blocks('storeos.testimonials.item.v1', list.map(item => ({ name: t(item.name, 60) || 'Cliente', city: '', text: t(item.text, 300), rating: 5 }))) };
    }
    case 'newsletter':
      return { type: 'storeos.newsletter.v1', settings: { heading: t(props.heading, 80), text: t(props.text, 160), ...all }, blocks: [] };
    case 'video':
      return { type: 'storeos.video.v1', settings: { heading: t(props.title, 80), videoUrl: videoUrl(props), caption: '', ...all }, blocks: [] };
    default:
      return null;
  }
}

/** Seções da página inicial do editor clássico, ou o destaque antigo quando a loja ainda não usa seções. */
function legacyHome(config: StorefrontConfig): HomeSection[] {
  if (config.home?.sections?.length) return config.home.sections;
  const section = (id: string, type: HomeSection['type'], props: Record<string, unknown> = {}): HomeSection => ({ id, type, hidden: false, props });
  return [
    section('banners', 'banners'),
    section('destaque', 'hero', { title: config.heroTitle ?? '', description: config.heroDescription ?? '', cta: config.heroCta ?? 'Ver produtos', ctaHref: '/categorias', imageUrl: config.heroImageUrl ?? '' }),
    section('categorias', 'categories', { heading: 'Compre por categoria', limit: 6 }),
    section('novidades', 'products', { heading: 'Novidades', subheading: '', limit: 8 }),
  ];
}

/**
 * Documento do editor de temas a partir do editor clássico: as páginas que não têm equivalente seguem o layout do tema base.
 * `{loja}` (temas prontos) vira o nome da loja.
 */
export function legacyToEngineDocument(config: StorefrontConfig, manifest: ThemeReleaseManifest, options: LegacyConversionOptions = {}): ThemeDocument {
  const document = structuredClone(manifest.defaultDocument);
  const replace = (value: string) => value.replace(/\{loja\}/g, options.storeName || 'nossa loja');
  const announcement = replace(cut(config.announcementText, 120));
  document.themeRelease = `${manifest.slug}@${manifest.version}`;
  document.global.designTokens = legacyDesignTokens(config);
  document.global.settings = { ...document.global.settings, showAnnouncement: Boolean(announcement), announcementText: announcement };

  const used = new Set(['announcement', 'header', 'footer']);
  const converted: ThemeSectionInstance[] = [];
  for (const section of legacyHome(config)) {
    let id = ENGINE_ID.test(section.id) ? section.id : 'secao';
    for (let n = 2; used.has(id); n++) id = `${section.id}-${n}`.slice(0, 96);
    const result = convertSection(section, id, options, replace);
    if (!result) continue;
    used.add(id);
    converted.push({ id, enabled: !section.hidden, ...result });
  }

  for (const pageType of ['home', 'landing'] as const) {
    const base = document.templates[pageType]?.sections ?? [];
    const announcementSection = base.find(section => section.type === 'storeos.announcement.v1');
    const header = base.find(section => section.type === 'storeos.header.v1');
    const footer = base.find(section => section.type === 'storeos.footer.v1');
    const middle = structuredClone(converted).slice(0, MAX_SECTIONS - 3);
    document.templates[pageType] = { sections: [
      ...(announcementSection ? [{ ...announcementSection, settings: { ...announcementSection.settings, text: announcement } }] : []),
      ...(header ? [header] : []),
      ...middle,
      ...(footer ? [footer] : []),
    ] };
  }
  for (const template of Object.values(document.templates)) {
    for (const section of template?.sections ?? []) {
      if (section.type === 'storeos.announcement.v1') section.settings = { ...section.settings, text: announcement };
    }
  }
  return document;
}
