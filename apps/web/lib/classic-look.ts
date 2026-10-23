import type { ThemeSectionInstance } from '@storeos/contracts';
import type { BannerSlide, HomeSection } from './api';
import { productSource, videoEmbedUrl } from './engine-media';

/**
 * Loja trazida sozinha do editor clássico para o editor novo (instalação com `classicLook`). Para a migração não mudar
 * o que o cliente vê, as seções são desenhadas com os mesmos componentes do editor clássico; o que só existe no editor
 * novo (perguntas, mosaico de imagens, banner com vários slides) segue o desenho do tema.
 */

export type ClassicPiece = { kind: 'section'; section: HomeSection } | { kind: 'banners'; slides: BannerSlide[] };

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const count = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

export function classicPiece(section: ThemeSectionInstance): ClassicPiece | null {
  const s = section.settings as Record<string, unknown>;
  const blocks = section.blocks.filter(block => block.enabled).map(block => block.settings as Record<string, unknown>);
  const make = (type: HomeSection['type'], props: HomeSection['props']): ClassicPiece => ({ kind: 'section', section: { id: section.id, type, hidden: false, props } });
  switch (section.type) {
    case 'storeos.carousel.v1':
      return { kind: 'banners', slides: blocks.filter(b => text(b.imageUrl)).map((b, i) => ({
        id: `${section.id}-${i}`, imageUrl: text(b.imageUrl), mobileImageUrl: text(b.mobileImageUrl) || null,
        title: text(b.title) || null, subtitle: text(b.subtitle) || null, ctaLabel: text(b.ctaLabel) || null, linkUrl: text(b.ctaUrl) || null,
      })) };
    case 'storeos.hero.v1':
      // Com banners extras o destaque vira carrossel, que só o editor novo desenha.
      if (section.blocks.some(block => block.enabled && block.type === 'storeos.hero.slide.v1')) return null;
      return make('hero', { title: text(s.title), description: text(s.subtitle), cta: text(s.ctaLabel), ctaHref: text(s.ctaUrl) || '/categorias', imageUrl: text(s.imageUrl) || null, imageAlt: '', layout: s.mobileAlign === 'center' ? 'centered' : 'split' });
    case 'storeos.product-collection.v1': {
      const source = productSource(s.sourceUrl);
      return make('products', { heading: text(s.heading), subheading: text(s.subheading), limit: count(s.limit, 8), columns: String(count(s.columns, 4)), categorySlug: source && 'category' in source ? source.category : '', productIds: [] });
    }
    case 'storeos.category-grid.v1':
      return make('categories', { heading: text(s.heading), limit: count(s.columns, 6), layout: s.mobileColumns === 3 ? 'circles' : 'cards' });
    case 'storeos.benefits.v1':
      return make('benefits', { items: blocks.map(b => ({ title: text(b.title), text: text(b.text) })) });
    case 'storeos.testimonials.v1':
      return make('testimonials', { heading: text(s.heading), items: blocks.filter(b => text(b.text)).map(b => ({ name: text(b.name), text: text(b.text) })) });
    case 'storeos.newsletter.v1':
      return make('newsletter', { heading: text(s.heading), text: text(s.text) });
    case 'storeos.rich-text.v1':
      return make('text', { heading: text(s.heading), body: text(s.body), align: s.align === 'center' ? 'center' : 'left' });
    case 'storeos.video.v1': {
      const embed = videoEmbedUrl(s.videoUrl);
      const youtube = embed?.match(/youtube-nocookie\.com\/embed\/([\w-]{11})$/)?.[1];
      const vimeo = embed?.match(/player\.vimeo\.com\/video\/(\d+)$/)?.[1];
      if (!youtube && !vimeo) return null;
      return make('video', { provider: youtube ? 'youtube' : 'vimeo', videoId: youtube ?? vimeo ?? '', title: text(s.heading) });
    }
    case 'storeos.image.v1':
      if (blocks.length !== 1 || !text(blocks[0].imageUrl)) return null;
      return make('image', { imageUrl: text(blocks[0].imageUrl), alt: text(blocks[0].alt), href: text(blocks[0].linkUrl) || null });
    default:
      return null;
  }
}
