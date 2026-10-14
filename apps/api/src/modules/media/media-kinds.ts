import { ImageInfo } from './image-info';

export type MediaKind = 'banner' | 'banner-mobile' | 'category-banner' | 'category-banner-mobile' | 'product' | 'other';

/** Dimensões recomendadas por uso; o painel mostra a mesma tabela ao lado do campo de envio. */
export const MEDIA_GUIDELINES: Record<Exclude<MediaKind, 'other'>, { width: number; height: number; label: string }> = {
  banner: { width: 1920, height: 700, label: 'Banner do carrossel' },
  'banner-mobile': { width: 800, height: 1000, label: 'Banner do carrossel (celular)' },
  'category-banner': { width: 1920, height: 400, label: 'Banner da categoria' },
  'category-banner-mobile': { width: 800, height: 500, label: 'Banner da categoria (celular)' },
  product: { width: 1000, height: 1250, label: 'Foto do produto' },
};

export const isMediaKind = (value: unknown): value is MediaKind => value === 'other' || (typeof value === 'string' && value in MEDIA_GUIDELINES);

/** Aviso (não bloqueia) quando a imagem foge da proporção recomendada ou é pequena demais. */
export function sizeWarning(kind: MediaKind, info: ImageInfo | undefined): string | undefined {
  if (kind === 'other' || !info) return undefined;
  const wanted = MEDIA_GUIDELINES[kind];
  if (info.width < wanted.width * 0.6) return `A imagem tem ${info.width}×${info.height}px e pode ficar borrada. O ideal é ${wanted.width}×${wanted.height}px.`;
  const ratio = info.width / info.height;
  const wantedRatio = wanted.width / wanted.height;
  if (Math.abs(ratio - wantedRatio) / wantedRatio > 0.15) return `A proporção de ${info.width}×${info.height}px difere do recomendado (${wanted.width}×${wanted.height}px); a imagem será cortada nas bordas.`;
  return undefined;
}
