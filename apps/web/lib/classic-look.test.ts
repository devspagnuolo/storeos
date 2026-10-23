import { describe, expect, it } from 'vitest';
import type { ThemeSectionInstance } from '@storeos/contracts';
import { classicPiece } from './classic-look';

const section = (type: string, settings: Record<string, unknown>, blocks: { type: string; settings: Record<string, unknown> }[] = []) =>
  ({ id: 'x', type, enabled: true, settings, blocks: blocks.map((block, i) => ({ id: `b${i}`, enabled: true, ...block })) }) as ThemeSectionInstance;

describe('visual clássico do tema Minha loja', () => {
  it('desenha as seções convertidas com os componentes do editor clássico', () => {
    expect(classicPiece(section('storeos.hero.v1', { title: 'Oi', subtitle: 'Texto', ctaLabel: 'Ver', ctaUrl: '/categorias', imageUrl: '', mobileAlign: 'center' }))).toMatchObject({ kind: 'section', section: { type: 'hero', props: { title: 'Oi', description: 'Texto', layout: 'centered' } } });
    expect(classicPiece(section('storeos.category-grid.v1', { heading: 'Categorias', columns: 6, mobileColumns: 3 }))).toMatchObject({ section: { type: 'categories', props: { limit: 6, layout: 'circles' } } });
    expect(classicPiece(section('storeos.product-collection.v1', { heading: 'Vestidos', limit: 8, columns: 4, sourceUrl: '/categorias/vestidos' }))).toMatchObject({ section: { type: 'products', props: { categorySlug: 'vestidos', columns: '4' } } });
    expect(classicPiece(section('storeos.carousel.v1', {}, [{ type: 'storeos.carousel.slide.v1', settings: { imageUrl: '/b.jpg', title: 'Coleção', ctaUrl: '/categorias' } }]))).toMatchObject({ kind: 'banners', slides: [{ imageUrl: '/b.jpg', title: 'Coleção', linkUrl: '/categorias' }] });
    expect(classicPiece(section('storeos.video.v1', { heading: 'Bastidores', videoUrl: 'https://youtu.be/dQw4w9WgXcQ' }))).toMatchObject({ section: { type: 'video', props: { provider: 'youtube', videoId: 'dQw4w9WgXcQ' } } });
  });

  it('o que só existe no editor novo segue o desenho do tema', () => {
    expect(classicPiece(section('storeos.faq.v1', {}))).toBeNull();
    expect(classicPiece(section('storeos.hero.v1', { title: 'Oi' }, [{ type: 'storeos.hero.slide.v1', settings: { imageUrl: '/b.jpg' } }]))).toBeNull();
    expect(classicPiece(section('storeos.header.v1', {}))).toBeNull();
  });
});
