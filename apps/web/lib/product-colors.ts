import type { ProductImage } from './api';

/** Atributo que representa a cor da peça ("Cor", "Cores", "Color"). */
export const isColorAttribute = (name: string) => /^(cor|cores|colou?r)$/i.test(name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim());

/** Evento disparado ao escolher uma cor na página do produto; a galeria escuta para trocar as fotos. */
export const COLOR_EVENT = 'storeos:product-color';

/**
 * Fotos a mostrar para a cor escolhida: as daquela cor; sem fotos dela, as gerais.
 * Sem cor escolhida: as gerais, ou as da primeira cor quando o produto só tem fotos por cor.
 */
export function imagesForColor(images: ProductImage[], color?: string | null) {
  const general = images.filter(i => !i.color);
  if (color) {
    const own = images.filter(i => i.color?.toLowerCase() === color.toLowerCase());
    if (own.length) return own;
  }
  if (general.length) return general;
  const first = images.find(i => i.color)?.color;
  return first ? images.filter(i => i.color === first) : images;
}
