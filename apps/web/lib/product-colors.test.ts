import { describe, expect, it } from 'vitest';
import { imagesForColor, isColorAttribute } from './product-colors';

const img = (url: string, color?: string) => ({ url, alt: null, color: color ?? null });

describe('imagesForColor', () => {
  const images = [img('geral'), img('preto-1', 'Preto'), img('preto-2', 'Preto'), img('verde', 'Verde')];
  it('mostra as fotos da cor escolhida', () => expect(imagesForColor(images, 'preto').map(i => i.url)).toEqual(['preto-1', 'preto-2']));
  it('sem cor escolhida ou cor sem foto, mostra as gerais', () => {
    expect(imagesForColor(images).map(i => i.url)).toEqual(['geral']);
    expect(imagesForColor(images, 'Marrom').map(i => i.url)).toEqual(['geral']);
  });
  it('produto só com fotos por cor começa pela primeira cor', () => expect(imagesForColor(images.slice(1)).map(i => i.url)).toEqual(['preto-1', 'preto-2']));
  it('reconhece o atributo de cor', () => expect(['Cor', 'Cores', 'color', 'Tamanho'].map(isColorAttribute)).toEqual([true, true, true, false]));
});
