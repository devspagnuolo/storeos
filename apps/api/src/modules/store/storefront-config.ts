import { BadRequestException } from '@nestjs/common';
import { PAGE_KEYS, PAGE_SECTION_TYPES, sanitizeDesign, sanitizeSections, type HomeSection, type PageKey, type StorefrontDesign } from './storefront-sections';

export type StorefrontConfig = {
  announcementText?: string;
  heroTitle?: string;
  heroDescription?: string;
  heroCta?: string;
  heroImageUrl?: string | null;
  accentColor?: string;
  design?: StorefrontDesign;
  home?: { sections: HomeSection[] };
  /** Seções extras que aparecem abaixo do conteúdo fixo das páginas de categoria e de produto. */
  pages?: Partial<Record<PageKey, { sections: HomeSection[] }>>;
};

const allowedKeys = new Set(['announcementText', 'heroTitle', 'heroDescription', 'heroCta', 'heroImageUrl', 'accentColor', 'design', 'home', 'pages']);
const textLimits: Record<string, number> = {
  announcementText: 100,
  heroTitle: 120,
  heroDescription: 300,
  heroCta: 40,
};

export function sanitizeStorefrontConfig(input: unknown): StorefrontConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('As configurações da vitrine precisam ser um objeto.');
  }

  const values = input as Record<string, unknown>;
  for (const key of Object.keys(values)) {
    if (!allowedKeys.has(key)) throw new BadRequestException(`Campo de vitrine não permitido: ${key}.`);
  }

  const result: StorefrontConfig = {};
  for (const [key, maxLength] of Object.entries(textLimits)) {
    const value = values[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.trim().length > maxLength || (key === 'heroTitle' && value.trim().length < 2)) {
      throw new BadRequestException(`Valor inválido para ${key}.`);
    }
    result[key as keyof Pick<StorefrontConfig, 'announcementText' | 'heroTitle' | 'heroDescription' | 'heroCta'>] = value.trim();
  }

  if (values.heroImageUrl !== undefined) {
    if (values.heroImageUrl === null || values.heroImageUrl === '') result.heroImageUrl = null;
    else if (typeof values.heroImageUrl !== 'string' || values.heroImageUrl.length > 500) {
      throw new BadRequestException('URL da imagem principal inválida.');
    } else {
      let url: URL;
      try { url = new URL(values.heroImageUrl); } catch { throw new BadRequestException('URL da imagem principal inválida.'); }
      if (url.protocol !== 'https:') throw new BadRequestException('A imagem principal precisa usar HTTPS.');
      result.heroImageUrl = url.toString();
    }
  }

  if (values.accentColor !== undefined) {
    if (typeof values.accentColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(values.accentColor)) {
      throw new BadRequestException('Escolha uma cor hexadecimal válida.');
    }
    result.accentColor = values.accentColor.toUpperCase();
  }
  if (values.design !== undefined) result.design = sanitizeDesign(values.design);
  if (values.home !== undefined) {
    if (!values.home || typeof values.home !== 'object' || Array.isArray(values.home)) throw new BadRequestException('Configuração da página inicial inválida.');
    const home = values.home as Record<string, unknown>;
    for (const key of Object.keys(home)) if (key !== 'sections') throw new BadRequestException(`Campo da página inicial não permitido: ${key}.`);
    result.home = { sections: sanitizeSections(home.sections) };
  }
  if (values.pages !== undefined) {
    if (!values.pages || typeof values.pages !== 'object' || Array.isArray(values.pages)) throw new BadRequestException('Configuração das páginas inválida.');
    const pages: NonNullable<StorefrontConfig['pages']> = {};
    for (const [key, raw] of Object.entries(values.pages as Record<string, unknown>)) {
      if (!(PAGE_KEYS as readonly string[]).includes(key)) throw new BadRequestException(`Página não permitida: ${key}.`);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('Configuração da página inválida.');
      for (const inner of Object.keys(raw)) if (inner !== 'sections') throw new BadRequestException(`Campo da página não permitido: ${inner}.`);
      pages[key as PageKey] = { sections: sanitizeSections((raw as Record<string, unknown>).sections, PAGE_SECTION_TYPES) };
    }
    result.pages = pages;
  }
  return result;
}
