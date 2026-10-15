import { BadRequestException } from '@nestjs/common';

/**
 * Modelo declarativo da vitrine: o lojista só escolhe tipos e preenche campos de texto/URL.
 * Nunca há HTML, CSS ou JS livre; tudo que não está nesta lista é rejeitado.
 */
export const SECTION_TYPES = ['banners', 'hero', 'image', 'carousel', 'text', 'categories', 'products', 'benefits', 'testimonials', 'newsletter', 'video'] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export type HomeSection = { id: string; type: SectionType; hidden: boolean; props: Record<string, unknown> };

export const MAX_SECTIONS = 30;

export const DESIGN_OPTIONS = {
  preset: ['classico', 'moderno', 'minimalista', 'vibrante'],
  font: ['sans', 'serif', 'rounded'],
  buttonRadius: ['none', 'sm', 'md', 'full'],
  containerWidth: ['narrow', 'normal', 'wide'],
  spacing: ['compact', 'normal', 'relaxed'],
} as const;

export type StorefrontDesign = {
  preset?: string; font?: string; buttonRadius?: string; containerWidth?: string; spacing?: string;
  logoUrl?: string | null; faviconUrl?: string | null; backgroundColor?: string; textColor?: string;
};

const fail = (message: string): never => { throw new BadRequestException(message); };

export function safeUrl(value: unknown, label: string, { max = 500, allowRelative = true } = {}): string {
  if (typeof value !== 'string' || value.length > max) return fail(`${label}: endereço inválido.`);
  const text = value.trim();
  if (allowRelative && /^\/(?![/\\])[^\s<>"']*$/.test(text)) return text;
  let url: URL;
  try { url = new URL(text); } catch { return fail(`${label}: endereço inválido.`); }
  if (url.protocol !== 'https:') return fail(`${label}: use um endereço HTTPS ou um caminho da loja (/categorias).`);
  return url.toString();
}

function text(value: unknown, label: string, max: number, { required = false } = {}): string {
  if (value === undefined || value === null) { if (required) fail(`${label} é obrigatório.`); return ''; }
  if (typeof value !== 'string') return fail(`${label} precisa ser texto.`);
  const trimmed = value.trim();
  if (trimmed.length > max) return fail(`${label} aceita até ${max} caracteres.`);
  if (required && !trimmed) return fail(`${label} é obrigatório.`);
  return trimmed;
}

function optionalUrl(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  return safeUrl(value, label);
}

function integer(value: unknown, label: string, min: number, max: number, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) return fail(`${label} precisa ser um número entre ${min} e ${max}.`);
  return value;
}

function items<T>(value: unknown, label: string, max: number, map: (item: Record<string, unknown>) => T): T[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > max) return fail(`${label} aceita até ${max} itens.`);
  return value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return fail(`${label}: item inválido.`);
    return map(item as Record<string, unknown>);
  });
}

function onlyKeys(props: Record<string, unknown>, allowed: string[], type: string) {
  for (const key of Object.keys(props)) if (!allowed.includes(key)) fail(`Campo não permitido na seção ${type}: ${key}.`);
}

/** Aceita apenas YouTube e Vimeo, e guarda só provedor + identificador (o embed é montado no site). */
export function parseVideo(input: unknown): { provider: 'youtube' | 'vimeo'; videoId: string } {
  let url: URL;
  try { url = new URL(String(input ?? '').trim()); } catch { return fail('Vídeo: informe o link do YouTube ou do Vimeo.'); }
  if (url.protocol !== 'https:') return fail('Vídeo: use um link HTTPS.');
  const host = url.hostname.replace(/^www\.|^m\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(embed|shorts)\/([\w-]{11})/.exec(url.pathname)?.[2] ?? null;
    if (id && /^[\w-]{11}$/.test(id)) return { provider: 'youtube', videoId: id };
  } else if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const match = /\/(?:video\/)?(\d{6,12})(?:\/|$)/.exec(url.pathname);
    if (match) return { provider: 'vimeo', videoId: match[1] };
  }
  if (id && /^[\w-]{11}$/.test(id) && host === 'youtu.be') return { provider: 'youtube', videoId: id };
  return fail('Vídeo: só aceitamos links do YouTube ou do Vimeo.');
}

const sanitizers: Record<SectionType, (props: Record<string, unknown>) => Record<string, unknown>> = {
  banners: props => { onlyKeys(props, [], 'banners'); return {}; },
  hero: props => {
    onlyKeys(props, ['title', 'description', 'cta', 'ctaHref', 'imageUrl', 'imageAlt'], 'hero');
    return {
      title: text(props.title, 'Título', 120, { required: true }), description: text(props.description, 'Texto de apoio', 300),
      cta: text(props.cta, 'Texto do botão', 40), ctaHref: props.ctaHref ? safeUrl(props.ctaHref, 'Link do botão') : '/categorias',
      imageUrl: optionalUrl(props.imageUrl, 'Imagem'), imageAlt: text(props.imageAlt, 'Texto alternativo', 140),
    };
  },
  image: props => {
    onlyKeys(props, ['imageUrl', 'mobileImageUrl', 'alt', 'href'], 'image');
    // Rascunhos podem ter seções ainda sem imagem; elas simplesmente não aparecem na loja.
    return { imageUrl: optionalUrl(props.imageUrl, 'Imagem'), mobileImageUrl: optionalUrl(props.mobileImageUrl, 'Imagem para celular'), alt: text(props.alt, 'Texto alternativo', 140), href: optionalUrl(props.href, 'Link') };
  },
  carousel: props => {
    onlyKeys(props, ['slides', 'autoplay'], 'carousel');
    const slides = items(props.slides, 'Carrossel', 10, slide => ({ imageUrl: optionalUrl(slide.imageUrl, 'Imagem'), alt: text(slide.alt, 'Texto alternativo', 140), href: optionalUrl(slide.href, 'Link') }))
      .filter(slide => slide.imageUrl);
    return { slides, autoplay: props.autoplay !== false };
  },
  text: props => {
    onlyKeys(props, ['heading', 'body', 'align'], 'text');
    const align = props.align === undefined ? 'left' : props.align;
    if (!['left', 'center'].includes(align as string)) fail('Alinhamento inválido.');
    return { heading: text(props.heading, 'Título', 120), body: text(props.body, 'Texto', 2000), align };
  },
  categories: props => {
    onlyKeys(props, ['heading', 'limit'], 'categories');
    return { heading: text(props.heading, 'Título', 80), limit: integer(props.limit, 'Quantidade', 1, 12, 6) };
  },
  products: props => {
    onlyKeys(props, ['heading', 'subheading', 'limit', 'categorySlug', 'productIds'], 'products');
    const productIds = props.productIds === undefined || props.productIds === null ? [] : props.productIds;
    if (!Array.isArray(productIds) || productIds.length > 24 || productIds.some(id => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) || new Set(productIds).size !== productIds.length) fail('Produtos escolhidos inválidos (até 24, sem repetir).');
    const slug = text(props.categorySlug, 'Categoria', 120);
    if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail('Categoria inválida.');
    return { heading: text(props.heading, 'Título', 80), subheading: text(props.subheading, 'Subtítulo', 80), limit: integer(props.limit, 'Quantidade', 1, 24, 8), categorySlug: slug, productIds };
  },
  benefits: props => {
    onlyKeys(props, ['items'], 'benefits');
    return { items: items(props.items, 'Benefícios', 6, item => ({ title: text(item.title, 'Título do benefício', 60), text: text(item.text, 'Texto do benefício', 140) })).filter(item => item.title) };
  },
  testimonials: props => {
    onlyKeys(props, ['heading', 'items'], 'testimonials');
    const list = items(props.items, 'Depoimentos', 6, item => ({ name: text(item.name, 'Nome', 60), text: text(item.text, 'Depoimento', 300) })).filter(item => item.text);
    return { heading: text(props.heading, 'Título', 80), items: list };
  },
  newsletter: props => {
    onlyKeys(props, ['heading', 'text'], 'newsletter');
    return { heading: text(props.heading, 'Título', 80), text: text(props.text, 'Texto', 200) };
  },
  video: props => {
    onlyKeys(props, ['url', 'provider', 'videoId', 'title'], 'video');
    const title = text(props.title, 'Título do vídeo', 120);
    if (props.url) return { ...parseVideo(props.url), title };
    if (props.videoId) return { ...parseVideo(props.provider === 'youtube' ? `https://youtu.be/${props.videoId}` : `https://vimeo.com/${props.videoId}`), title };
    return { provider: null, videoId: null, title };
  },
};

export function sanitizeSections(input: unknown): HomeSection[] {
  if (!Array.isArray(input)) return fail('As seções da página inicial precisam ser uma lista.');
  if (input.length > MAX_SECTIONS) return fail(`A página inicial aceita até ${MAX_SECTIONS} seções.`);
  const seen = new Set<string>();
  return input.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('Seção inválida.');
    const section = raw as Record<string, unknown>;
    for (const key of Object.keys(section)) if (!['id', 'type', 'hidden', 'props'].includes(key)) fail(`Campo não permitido na seção: ${key}.`);
    const id = section.id;
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(id) || seen.has(id)) return fail('Identificador de seção inválido ou repetido.');
    seen.add(id);
    const type = section.type as SectionType;
    if (!SECTION_TYPES.includes(type)) return fail(`Tipo de seção não suportado: ${String(section.type)}.`);
    const props = section.props ?? {};
    if (typeof props !== 'object' || Array.isArray(props)) return fail('Configuração da seção inválida.');
    if (section.hidden !== undefined && typeof section.hidden !== 'boolean') return fail('Campo "oculta" inválido.');
    return { id, type, hidden: section.hidden === true, props: sanitizers[type](props as Record<string, unknown>) };
  });
}

function luminance(hex: string) {
  const channel = (index: number) => {
    const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

export function contrastRatio(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

const hexColor = /^#[0-9a-fA-F]{6}$/;

export function sanitizeDesign(input: unknown): StorefrontDesign {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('O visual da loja precisa ser um objeto.');
  const values = input as Record<string, unknown>;
  const allowed = [...Object.keys(DESIGN_OPTIONS), 'logoUrl', 'faviconUrl', 'backgroundColor', 'textColor'];
  for (const key of Object.keys(values)) if (!allowed.includes(key)) fail(`Campo de visual não permitido: ${key}.`);
  const result: StorefrontDesign = {};
  for (const [key, options] of Object.entries(DESIGN_OPTIONS)) {
    if (values[key] === undefined) continue;
    if (!(options as readonly string[]).includes(values[key] as string)) fail(`Valor inválido para ${key}.`);
    (result as Record<string, string>)[key] = values[key] as string;
  }
  for (const key of ['logoUrl', 'faviconUrl'] as const) if (values[key] !== undefined) result[key] = optionalUrl(values[key], key === 'logoUrl' ? 'Logo' : 'Favicon');
  for (const key of ['backgroundColor', 'textColor'] as const) {
    if (values[key] === undefined) continue;
    if (typeof values[key] !== 'string' || !hexColor.test(values[key] as string)) fail('Escolha cores hexadecimais válidas.');
    result[key] = (values[key] as string).toUpperCase();
  }
  if (result.backgroundColor && result.textColor && contrastRatio(result.backgroundColor, result.textColor) < 4.5) {
    fail('O contraste entre o texto e o fundo está baixo (mínimo 4,5:1). Escolha cores mais distintas.');
  }
  return result;
}
