import { describe, expect, it } from 'vitest';
import { productSource, videoEmbedUrl } from './engine-media';

describe('vídeo do tema', () => {
  it('aceita links comuns do YouTube e do Vimeo', () => {
    expect(videoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(videoEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(videoEmbedUrl('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(videoEmbedUrl('https://vimeo.com/76979871')).toBe('https://player.vimeo.com/video/76979871');
  });
  it('recusa outros sites, http e IDs estranhos', () => {
    expect(videoEmbedUrl('http://youtu.be/dQw4w9WgXcQ')).toBeNull();
    expect(videoEmbedUrl('https://evil.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(videoEmbedUrl('https://youtu.be/abc"onload')).toBeNull();
    expect(videoEmbedUrl('')).toBeNull();
  });
});

describe('origem da vitrine', () => {
  it('entende categoria e coleção', () => {
    expect(productSource('/categorias/vestidos')).toEqual({ category: 'vestidos' });
    expect(productSource('/colecoes/verao-2026')).toEqual({ collection: 'verao-2026' });
    expect(productSource('https://x.com/categorias/a')).toBeNull();
    expect(productSource('')).toBeNull();
  });
});
