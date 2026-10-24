import { BackdropStyle } from './photo-compose';

/** Fundo padrão das fotos de produto, salvo por loja em Store.photoBackground. */
export type PhotoBackground = { enabled: boolean; color: string; style: BackdropStyle; imageUrl: string | null; shadow: boolean; floor: number };

export const DEFAULT_PHOTO_BACKGROUND: PhotoBackground = { enabled: false, color: '#F2F2F2', style: 'studio', imageUrl: null, shadow: true, floor: 0.88 };
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export const BACKDROP_STYLES: BackdropStyle[] = ['flat', 'studio', 'image'];

export function parsePhotoBackground(raw: unknown): PhotoBackground {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const imageUrl = typeof value.imageUrl === 'string' && value.imageUrl.startsWith('https://') ? value.imageUrl : null;
  const style = BACKDROP_STYLES.includes(value.style as BackdropStyle) ? value.style as BackdropStyle : DEFAULT_PHOTO_BACKGROUND.style;
  return {
    enabled: value.enabled === true,
    color: typeof value.color === 'string' && HEX_COLOR.test(value.color) ? value.color.toUpperCase() : DEFAULT_PHOTO_BACKGROUND.color,
    // Sem imagem salva, "minha imagem" cai no estúdio para nunca sair foto sem fundo.
    style: style === 'image' && !imageUrl ? 'studio' : style,
    imageUrl,
    shadow: value.shadow === undefined ? DEFAULT_PHOTO_BACKGROUND.shadow : value.shadow === true,
    floor: typeof value.floor === 'number' && value.floor >= 0.5 && value.floor <= 1 ? Math.round(value.floor * 1000) / 1000 : DEFAULT_PHOTO_BACKGROUND.floor,
  };
}

/** Executa no máximo `limit` tarefas ao mesmo tempo, mantendo a ordem dos resultados. */
export async function inBatches<T, R>(items: T[], limit: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  for (let start = 0; start < items.length; start += limit) {
    const slice = items.slice(start, start + limit);
    (await Promise.all(slice.map((item, i) => work(item, start + i)))).forEach((result, i) => { results[start + i] = result; });
  }
  return results;
}

/** Silhueta usada na prévia do painel (não gasta crédito do Photoroom). */
export const SAMPLE_CUTOUT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000">
  <ellipse cx="400" cy="140" rx="54" ry="62" fill="#c98f6b"/>
  <path d="M352 196 Q400 230 448 196 L470 230 Q520 250 530 300 L560 520 L515 530 L495 330 L505 420 Q570 620 585 770 Q400 800 215 770 Q230 620 295 420 L305 330 L285 530 L240 520 L270 300 Q280 250 330 230 Z" fill="#7a1f3d"/>
  <rect x="335" y="770" width="46" height="150" rx="18" fill="#c98f6b"/><rect x="420" y="770" width="46" height="150" rx="18" fill="#c98f6b"/>
  <rect x="318" y="912" width="70" height="22" rx="10" fill="#222"/><rect x="413" y="912" width="70" height="22" rx="10" fill="#222"/>
</svg>`;
