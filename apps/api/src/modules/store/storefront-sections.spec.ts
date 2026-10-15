import { BadRequestException } from '@nestjs/common';
import { contrastRatio, parseVideo, sanitizeDesign, sanitizeSections } from './storefront-sections';
import { sanitizeStorefrontConfig } from './storefront-config';

const section = (type: string, props: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({ id: 's-' + type, type, props, ...extra });

describe('seções da vitrine', () => {
  it('normaliza seções válidas e preserva a ordem', () => {
    const result = sanitizeSections([
      section('hero', { title: ' Coleção ', imageUrl: 'https://cdn.exemplo.com/a.webp' }),
      section('products', { limit: 4, categorySlug: 'blusas' }, { hidden: true }),
      section('banners'),
    ]);
    expect(result.map(item => item.type)).toEqual(['hero', 'products', 'banners']);
    expect(result[0].props).toMatchObject({ title: 'Coleção', ctaHref: '/categorias' });
    expect(result[1].hidden).toBe(true);
  });

  it('guarda os produtos escolhidos pelo lojista, sem repetir e até 24', () => {
    const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
    expect(sanitizeSections([section('products', { productIds: ids })])[0].props.productIds).toEqual(ids);
    expect(sanitizeSections([section('products', {})])[0].props.productIds).toEqual([]);
    expect(() => sanitizeSections([section('products', { productIds: [ids[0], ids[0]] })])).toThrow(BadRequestException);
    expect(() => sanitizeSections([section('products', { productIds: ['x'] })])).toThrow(BadRequestException);
    expect(() => sanitizeSections([section('products', { productIds: Array.from({ length: 25 }, (_, i) => `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`) })])).toThrow(BadRequestException);
  });

  it('páginas de categoria e produto aceitam só alguns tipos de seção', () => {
    const ok = sanitizeStorefrontConfig({ pages: { category: { sections: [section('text', { body: 'Frete grátis' })] }, product: { sections: [section('benefits', { items: [{ title: 'Troca fácil' }] })] } } });
    expect(ok.pages?.category?.sections[0].type).toBe('text');
    expect(() => sanitizeStorefrontConfig({ pages: { category: { sections: [section('hero', {})] } } })).toThrow(BadRequestException);
    expect(() => sanitizeStorefrontConfig({ pages: { home: { sections: [] } } })).toThrow(BadRequestException);
    expect(() => sanitizeStorefrontConfig({ pages: { product: { sections: [], extra: 1 } } })).toThrow(BadRequestException);
  });

  it.each([
    ['tipo desconhecido', [section('html', { code: '<b>' })]],
    ['campo extra na seção', [{ ...section('text', { body: 'oi' }), onclick: 'x' }]],
    ['prop não permitida', [section('text', { body: 'oi', script: '<script>' })]],
    ['URL javascript', [section('image', { imageUrl: 'javascript:alert(1)' })]],
    ['URL http', [section('image', { imageUrl: 'http://x.com/a.png' })]],
    ['URL protocolo-relativa', [section('image', { imageUrl: '//evil.com/a.png' })]],
    ['link javascript', [section('image', { imageUrl: '/a.png', href: 'javascript:alert(1)' })]],
    ['id repetido', [section('banners'), section('banners')]],
    ['vídeo fora da lista', [section('video', { url: 'https://evil.com/v.mp4' })]],
    ['texto longo', [section('text', { body: 'x'.repeat(2001) })]],
  ])('rejeita %s', (_, input) => {
    expect(() => sanitizeSections(input)).toThrow(BadRequestException);
  });

  it('aceita rascunhos incompletos, descartando itens vazios', () => {
    const [image, carousel, video] = sanitizeSections([section('image', {}), section('carousel', { slides: [{ imageUrl: '' }, { imageUrl: '/a.png' }] }), section('video', {})]);
    expect(image.props.imageUrl).toBeNull();
    expect(carousel.props.slides).toHaveLength(1);
    expect(video.props.provider).toBeNull();
  });

  it('aceita caminho relativo da loja e limita o total de seções', () => {
    expect(sanitizeSections([section('image', { imageUrl: '/api/v1/media/abc', href: '/categorias/blusas' })])[0].props.href).toBe('/categorias/blusas');
    expect(() => sanitizeSections(Array.from({ length: 31 }, (_, i) => ({ id: 'a' + i, type: 'banners' })))).toThrow(BadRequestException);
  });

  it('reconhece só YouTube e Vimeo', () => {
    expect(parseVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({ provider: 'youtube', videoId: 'dQw4w9WgXcQ' });
    expect(parseVideo('https://youtu.be/dQw4w9WgXcQ')).toEqual({ provider: 'youtube', videoId: 'dQw4w9WgXcQ' });
    expect(parseVideo('https://youtube.com/embed/dQw4w9WgXcQ')).toEqual({ provider: 'youtube', videoId: 'dQw4w9WgXcQ' });
    expect(parseVideo('https://vimeo.com/123456789')).toEqual({ provider: 'vimeo', videoId: '123456789' });
    expect(() => parseVideo('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ')).toThrow(BadRequestException);
    expect(() => parseVideo('http://youtu.be/dQw4w9WgXcQ')).toThrow(BadRequestException);
  });
});

describe('visual da loja', () => {
  it('valida opções, cores e contraste', () => {
    expect(sanitizeDesign({ preset: 'moderno', font: 'serif', textColor: '#111111', backgroundColor: '#ffffff' })).toMatchObject({ backgroundColor: '#FFFFFF' });
    expect(() => sanitizeDesign({ preset: 'inexistente' })).toThrow(BadRequestException);
    expect(() => sanitizeDesign({ css: 'body{}' })).toThrow(BadRequestException);
    expect(() => sanitizeDesign({ textColor: '#999999', backgroundColor: '#ffffff' })).toThrow(/contraste/);
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });

  it('integra design e home à configuração da vitrine', () => {
    const config = sanitizeStorefrontConfig({ accentColor: '#112233', design: { font: 'rounded' }, home: { sections: [section('banners')] } });
    expect(config.home?.sections).toHaveLength(1);
    expect(() => sanitizeStorefrontConfig({ home: { sections: [], extra: 1 } })).toThrow(BadRequestException);
  });
});
