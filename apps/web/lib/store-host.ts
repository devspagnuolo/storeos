import { headers } from 'next/headers';
import { apiUrl, defaultSiteUrl, defaultStoreSlug } from './config';

/** Domínios que sempre servem a loja padrão: desenvolvimento, domínio técnico do Render e o endereço oficial configurado. */
export function isDefaultHost(host: string, siteUrl = defaultSiteUrl) {
  if (!host || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.onrender.com')) return true;
  try { return new URL(siteUrl).hostname === host; } catch { return false; }
}

export function normalizeHost(raw: string | null | undefined) {
  return (raw ?? '').split(',')[0].trim().split(':')[0].toLowerCase();
}

export async function requestHost() {
  const h = await headers();
  return normalizeHost(h.get('x-forwarded-host') ?? h.get('host'));
}

/** Loja que atende o domínio da requisição; domínio desconhecido cai na loja padrão (nunca em outra loja). */
export async function resolveStoreSlug(): Promise<string> {
  const host = await requestHost();
  if (isDefaultHost(host)) return defaultStoreSlug;
  try {
    const response = await fetch(`${apiUrl}/store/by-host?host=${encodeURIComponent(host)}`, { next: { revalidate: 60 } });
    if (response.ok) return (await response.json()).slug as string;
  } catch {
    // API fora do ar: a loja padrão continua atendendo.
  }
  return defaultStoreSlug;
}

/** Endereço público para sitemap e links absolutos: o domínio acessado quando é um domínio de loja, senão o configurado. */
export async function resolveSiteUrl(): Promise<string> {
  const host = await requestHost();
  if (isDefaultHost(host)) return defaultSiteUrl;
  return `https://${host}`;
}
