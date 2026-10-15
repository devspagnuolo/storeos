import type { StorefrontConfig, StorefrontDesign } from './api';

export const DEFAULT_ACCENT = '#5B3DF5';

export const PRESETS: Record<string, { label: string; description: string; design: Required<Pick<StorefrontDesign, 'font' | 'buttonRadius' | 'containerWidth' | 'spacing'>>; accent?: string }> = {
  classico: { label: 'Clássico', description: 'Equilibrado, cantos suaves.', design: { font: 'sans', buttonRadius: 'md', containerWidth: 'normal', spacing: 'normal' } },
  moderno: { label: 'Moderno', description: 'Botões arredondados e página larga.', design: { font: 'sans', buttonRadius: 'full', containerWidth: 'wide', spacing: 'normal' } },
  minimalista: { label: 'Minimalista', description: 'Cantos retos, muito espaço.', design: { font: 'serif', buttonRadius: 'none', containerWidth: 'narrow', spacing: 'relaxed' } },
  vibrante: { label: 'Vibrante', description: 'Tipografia amigável e cor forte.', design: { font: 'rounded', buttonRadius: 'full', containerWidth: 'normal', spacing: 'compact' }, accent: '#E11D74' },
};

const FONTS: Record<string, string> = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", serif',
  rounded: 'ui-rounded, "Nunito", "Trebuchet MS", system-ui, sans-serif',
};
const RADIUS: Record<string, string> = { none: '0px', sm: '0.375rem', md: '0.75rem', full: '9999px' };
const WIDTH: Record<string, string> = { narrow: '64rem', normal: '80rem', wide: '96rem' };
const SPACING: Record<string, string> = { compact: '2.5rem', normal: '4rem', relaxed: '6rem' };

export function hexToChannels(hex: string) {
  return `${parseInt(hex.slice(1, 3), 16)} ${parseInt(hex.slice(3, 5), 16)} ${parseInt(hex.slice(5, 7), 16)}`;
}

function luminance(hex: string) {
  const c = (i: number) => { const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * c(0) + 0.7152 * c(1) + 0.0722 * c(2);
}
export function contrastRatio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function accentOf(config: StorefrontConfig) {
  return config.accentColor ?? PRESETS[config.design?.preset ?? '']?.accent ?? DEFAULT_ACCENT;
}

/** Variáveis CSS (e cores da página) derivadas da configuração; só números e listas fixas, nunca texto livre. */
const CARD_STYLES: Record<string, Record<string, string>> = {
  soft: {},
  flat: { '--card-border-width': '0px', '--card-shadow': 'none', '--card-radius': '0.5rem', '--card-bg': 'rgb(var(--slate-100))' },
  outline: { '--card-border-width': '1px', '--card-shadow': 'none', '--card-radius': '0.375rem' },
  elevated: { '--card-border-width': '0px', '--card-shadow': '0 10px 30px -12px rgb(15 23 42 / 0.25)', '--card-radius': '1.25rem' },
};
const HEADING_FONTS: Record<string, Record<string, string>> = {
  same: {},
  serif: { '--heading-font': 'ui-serif, Georgia, Cambria, "Times New Roman", serif', '--heading-tracking': '-0.01em' },
  display: { '--heading-font': 'inherit', '--heading-tracking': '-0.03em' },
};

/** Só o que é seguro para a vitrine: valores vêm de listas fixas, nunca de texto livre. */
export function themeAttributes(config: StorefrontConfig) {
  const design = config.design ?? {};
  return { dark: design.mode === 'dark', heroTone: ['dark', 'light', 'brand'].includes(design.heroTone ?? '') ? design.heroTone as string : 'dark' };
}

export function themeStyle(config: StorefrontConfig, { admin = false }: { admin?: boolean } = {}): Record<string, string> {
  const design = config.design ?? {};
  const preset = PRESETS[design.preset ?? 'classico'] ?? PRESETS.classico;
  const accent = accentOf(config);
  const style: Record<string, string> = {
    '--brand': hexToChannels(accent),
    '--brand-fg': contrastRatio(accent, '#FFFFFF') >= 3 ? '255 255 255' : '17 24 39',
    '--btn-radius': RADIUS[design.buttonRadius ?? preset.design.buttonRadius],
    '--container': WIDTH[design.containerWidth ?? preset.design.containerWidth],
    '--section-y': SPACING[design.spacing ?? preset.design.spacing],
    fontFamily: FONTS[design.font ?? preset.design.font],
  };
  if (!admin) Object.assign(style, CARD_STYLES[design.cardStyle ?? 'soft'], HEADING_FONTS[design.headingFont ?? 'same']);
  if (design.backgroundColor) { style.backgroundColor = design.backgroundColor; style['--page-bg'] = hexToChannels(design.backgroundColor); }
  if (design.textColor) style.color = design.textColor;
  return style;
}
