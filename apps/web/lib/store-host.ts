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

/** Domínio-base para lojas sem domínio próprio (ex.: lojas.exemplo.com.br → vivi.lojas.exemplo.com.br). Vazio = recurso desligado. */
export const storeBaseDomain = () => (process.env.STORE_BASE_DOMAIN ?? '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');

const RESERVED_LABELS = new Set(['www', 'api', 'app', 'admin', 'painel', 'mail', 'smtp', 'send', 'static', 'assets', 'login', 'blog', 'storeos', 'suporte', 'ajuda']);

/** Subdomínio da plataforma → slug da loja, só se o domínio-base estiver configurado e o rótulo for um slug válido. */
export function platformSlug(host: string, base = storeBaseDomain()) {
  if (!base || !host.endsWith('.' + base)) return null;
  const label = host.slice(0, -(base.length + 1));
  return /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(label) && !RESERVED_LABELS.has(label) ? label : null;
}

export async function requestHost() {
  const h = await headers();
  return normalizeHost(h.get('x-forwarded-host') ?? h.get('host'));
}

/** Loja que atende o domínio da requisição; domínio desconhecido cai na loja padrão (nunca em outra loja). */
export async function resolveStoreSlug(): Promise<string> {
  const host = await requestHost();
  if (isDefaultHost(host)) return defaultStoreSlug;
  const subdomain = platformSlug(host);
  if (subdomain) {
    try {
      const response = await fetch(`${apiUrl}/store/public/${encodeURIComponent(subdomain)}`, { next: { revalidate: 60 } });
      if (response.ok) return subdomain;
    } catch {
      // API fora do ar: a loja padrão continua atendendo.
    }
    return defaultStoreSlug;
  }
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
