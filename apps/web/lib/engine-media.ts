/** Endereço de incorporação seguro a partir do link que a lojista colou (só YouTube e Vimeo, só o ID validado). */
export function videoEmbedUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.replace(/^www\.|^m\./, '');
  let id = '';
  if (host === 'youtu.be') id = url.pathname.slice(1);
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') id = url.searchParams.get('v') ?? url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] ?? '';
  if (id) return /^[\w-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const vimeo = url.pathname.match(/(?:^|\/)(\d{6,12})(?:\/|$)/)?.[1];
    return vimeo ? `https://player.vimeo.com/video/${vimeo}` : null;
  }
  return null;
}

/** Categoria ou coleção escolhida no seletor de link do tema (`/categorias/x`, `/colecoes/y`). */
export function productSource(raw: unknown): { category: string } | { collection: string } | null {
  if (typeof raw !== 'string') return null;
  const match = raw.trim().match(/^\/(categorias|colecoes)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);
  if (!match) return null;
  return match[1] === 'categorias' ? { category: match[2] } : { collection: match[2] };
}
