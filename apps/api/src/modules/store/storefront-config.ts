import { BadRequestException } from '@nestjs/common';

export type StorefrontConfig = {
  announcementText?: string;
  heroTitle?: string;
  heroDescription?: string;
  heroCta?: string;
  heroImageUrl?: string | null;
  accentColor?: string;
};

const allowedKeys = new Set(['announcementText', 'heroTitle', 'heroDescription', 'heroCta', 'heroImageUrl', 'accentColor']);
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
  return result;
}
