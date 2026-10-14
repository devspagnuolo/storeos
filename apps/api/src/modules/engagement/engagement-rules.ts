/** Regras puras de banners, WhatsApp e newsletter. */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const normalizeEmail = (raw: string) => raw.trim().toLowerCase();
export const isValidEmail = (email: string) => email.length <= 254 && EMAIL.test(email);

/** Número do WhatsApp só com dígitos; aceita +55, parênteses e traços. Sem DDI, assume Brasil (55). Devolve undefined se não for um celular/fixo plausível. */
export function normalizeWhatsapp(raw: string): string | undefined {
  const digits = raw.replace(/\D/g, '');
  if (raw.trim().startsWith('+') && !digits.startsWith('55')) return undefined;
  const withCountry = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return /^55\d{10,11}$/.test(withCountry) ? withCountry : undefined;
}

export const whatsappLink = (number: string, message?: string | null) => `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ''}`;

/** Links de banner: caminho da loja ou https. */
export const isSafeBannerLink = (value: string) => /^\/(?!\/)[^\s]*$/.test(value) || /^https:\/\/[^\s]+$/.test(value);

export type BannerWindow = { active: boolean; startsAt: Date | null; endsAt: Date | null };
export const bannerIsLive = (banner: BannerWindow, now = new Date()) =>
  banner.active && (!banner.startsAt || banner.startsAt <= now) && (!banner.endsAt || banner.endsAt > now);
