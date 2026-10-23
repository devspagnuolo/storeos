import { cache } from 'react';
import type { ThemeDocument } from '@storeos/contracts';
import { getStore } from './api';
import { contrastRatio, hexToChannels } from './theme';

/**
 * Documento do Theme Engine que desenha esta requisição. Na vitrine é o publicado (só chega se a loja estiver
 * na lista piloto); na prévia privada do painel, o rascunho é colocado aqui antes de desenhar a página real.
 * `cache` isola o valor por requisição: uma prévia nunca vaza para outra visita.
 */
const override = cache(() => ({ document: null as ThemeDocument | null }));

export function setEngineDraft(document: ThemeDocument) { override().document = document; }

export async function activeEngineDocument(): Promise<ThemeDocument | null> {
  const draft = override().document;
  if (draft) return draft;
  return (await getStore()).publishedTheme?.document ?? null;
}

/**
 * As seções extras de categoria e produto do editor clássico (vantagens, "Combina com", newsletter) continuam na loja
 * quando o tema no ar veio da migração automática do editor clássico: assim a migração não muda o que o cliente vê.
 */
export async function showsClassicPageSections(): Promise<boolean> {
  if (override().document) return false;
  const published = (await getStore()).publishedTheme;
  return !published || published.classicLook === true;
}

/** Configurações da primeira seção visível de um tipo dentro do modelo de página, ou null quando o tema não a usa. */
export function engineSection(document: ThemeDocument | null, pageType: keyof ThemeDocument['templates'], type: string): Record<string, unknown> | null {
  const section = document?.templates[pageType]?.sections.find(item => item.enabled && item.type === type);
  return section ? section.settings as Record<string, unknown> : null;
}

export const engineText = (value: unknown, fallback = '') => typeof value === 'string' && value.trim() ? value : fallback;
export const engineFlag = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback;
export const engineNumber = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : undefined;

const HEX = /^#[0-9a-f]{6}$/i;
const RADIUS = /^(?:[0-9]{1,2}px|9999px)$/;
const FONTS: Record<string, string> = { system: 'system-ui, sans-serif', 'sans-serif': 'Arial, Helvetica, sans-serif', serif: 'Georgia, "Times New Roman", serif' };

// "Minha loja" (editor clássico convertido) usa as mesmas medidas e fontes que o editor clássico usava.
const CLASSIC_RADIUS: Record<string, string> = { '0px': '0px', '4px': '0.375rem', '8px': '0.75rem', '9999px': '9999px' };
const CLASSIC_SERIF = 'ui-serif, Georgia, Cambria, "Times New Roman", serif';

/** Tokens de design do tema convertidos nas mesmas variáveis CSS da vitrine. Só aceita valores validados. */
export function engineStyle(document: ThemeDocument | null, { classic = false }: { classic?: boolean } = {}): Record<string, string> {
  if (!document) return {};
  const tokens = document.global.designTokens;
  const style: Record<string, string> = {};
  const primary = tokens.colors?.primary;
  if (primary && HEX.test(primary)) {
    style['--brand'] = hexToChannels(primary);
    style['--brand-fg'] = contrastRatio(primary, '#FFFFFF') >= 3 ? '255 255 255' : '17 24 39';
  }
  const background = tokens.colors?.background;
  if (background && HEX.test(background)) { style.backgroundColor = background; style['--page-bg'] = hexToChannels(background); }
  const text = tokens.colors?.text;
  if (text && HEX.test(text)) style.color = text;
  const radius = String(tokens.shape?.buttonRadius ?? '');
  if (RADIUS.test(radius)) style['--btn-radius'] = classic ? CLASSIC_RADIUS[radius] ?? radius : radius;
  const fontToken = String(tokens.typography?.fontFamily ?? '');
  // No visual clássico a fonte sem serifa é a escolhida no editor clássico; o tema só troca quando pede serifa.
  const font = classic ? (fontToken === 'serif' ? CLASSIC_SERIF : undefined) : FONTS[fontToken];
  if (font) style.fontFamily = font;
  return style;
}
