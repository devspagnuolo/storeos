import { BadRequestException } from '@nestjs/common';

export type MarketingConfig = { ga4?: string; gtm?: string; metaPixel?: string; googleVerification?: string; homeTitle?: string; homeDescription?: string };

const PATTERNS: Record<'ga4' | 'gtm' | 'metaPixel' | 'googleVerification', [RegExp, string]> = {
  ga4: [/^G-[A-Z0-9]{6,14}$/, 'O ID do Google Analytics começa com G- (exemplo: G-ABC123DEF4).'],
  gtm: [/^GTM-[A-Z0-9]{4,10}$/, 'O ID do Google Tag Manager começa com GTM- (exemplo: GTM-ABC1234).'],
  metaPixel: [/^\d{8,20}$/, 'O ID do pixel do Meta tem só números (de 8 a 20 dígitos).'],
  googleVerification: [/^[A-Za-z0-9_-]{20,100}$/, 'Cole só o código de verificação do Google (o texto do campo content), sem as aspas e sem a tag inteira.'],
};

/** Limpa o que o lojista digitou: só IDs no formato certo entram (nada de script solto na vitrine). Vazio remove o campo. */
export function parseMarketingConfig(input: Record<string, unknown>): MarketingConfig {
  const out: MarketingConfig = {};
  for (const key of Object.keys(PATTERNS) as (keyof typeof PATTERNS)[]) {
    const raw = typeof input[key] === 'string' ? (input[key] as string).trim() : '';
    if (!raw) continue;
    const value = key === 'googleVerification' || key === 'metaPixel' ? raw : raw.toUpperCase();
    if (!PATTERNS[key][0].test(value)) throw new BadRequestException(PATTERNS[key][1]);
    out[key] = value;
  }
  const title = typeof input.homeTitle === 'string' ? input.homeTitle.trim() : '';
  const description = typeof input.homeDescription === 'string' ? input.homeDescription.trim() : '';
  if (title.length > 70) throw new BadRequestException('O título da página inicial deve ter até 70 caracteres.');
  if (description.length > 200) throw new BadRequestException('A descrição da página inicial deve ter até 200 caracteres.');
  if (title) out.homeTitle = title;
  if (description) out.homeDescription = description;
  return out;
}

/** Lê o que está salvo no banco de forma defensiva (JSON livre). */
export function readMarketingConfig(value: unknown): MarketingConfig {
  try { return parseMarketingConfig((value ?? {}) as Record<string, unknown>); } catch { return {}; }
}

export type ProductSeoInput = { seoTitle: string | null; seoDescription: string | null; description: string | null; images: { alt: string | null }[] };
export type SeoIssue = 'no-photo' | 'no-description' | 'short-description' | 'no-seo-description' | 'no-alt' | 'no-seo-title';
export const ISSUE_LABEL: Record<SeoIssue, string> = {
  'no-photo': 'Sem foto', 'no-description': 'Sem descrição', 'short-description': 'Descrição muito curta (menos de 80 letras)',
  'no-seo-description': 'Sem texto para o Google', 'no-alt': 'Foto sem texto alternativo', 'no-seo-title': 'Sem título para o Google',
};

export function productIssues(p: ProductSeoInput): SeoIssue[] {
  const issues: SeoIssue[] = [];
  if (!p.images.length) issues.push('no-photo');
  else if (p.images.some(i => !i.alt?.trim())) issues.push('no-alt');
  const description = p.description?.trim() ?? '';
  if (!description) issues.push('no-description');
  else if (description.length < 80) issues.push('short-description');
  if (!p.seoTitle?.trim()) issues.push('no-seo-title');
  // Sem texto próprio para o Google, o site usa o começo da descrição: só falta se não houver nem isso.
  if (!p.seoDescription?.trim() && description.length < 80) issues.push('no-seo-description');
  return issues;
}
