import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACCESS_COOKIE, serverApiUrl } from '../../../../../lib/admin/session';

export const dynamic = 'force-dynamic';

const message = (body: { message?: unknown }) => (Array.isArray(body.message) ? 'Confira a foto.' : typeof body.message === 'string' ? body.message : undefined);

/**
 * Fundo padrão nas fotos do produto, chamado pelo envio de imagens do painel.
 * `state`: se o recorte está disponível e a original de cada foto já trocada; `apply`: troca o fundo de uma foto.
 */
export async function POST(request: Request) {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return NextResponse.json({ message: 'Sessão expirada. Entre novamente.' }, { status: 401 });
  const input = await request.json().catch(() => ({})) as { action?: string; url?: unknown; urls?: unknown };
  const call = (path: string, init?: { method: string; body: unknown }) => fetch(`${serverApiUrl}${path}`, { method: init?.method ?? 'GET', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: init ? JSON.stringify(init.body) : undefined, cache: 'no-store' }).catch(() => undefined);

  if (input.action === 'state') {
    const urls = Array.isArray(input.urls) ? input.urls.filter((url): url is string => typeof url === 'string').slice(0, 60) : [];
    const [settings, originals] = await Promise.all([call('/media/background'), urls.length ? call('/media/background/originals', { method: 'POST', body: { urls } }) : undefined]);
    const config = settings?.ok ? await settings.json().catch(() => ({})) : {};
    return NextResponse.json({ available: Boolean(config.available), enabled: Boolean(config.enabled), originals: originals?.ok ? await originals.json().catch(() => ({})) : {} });
  }
  if (input.action === 'apply' && typeof input.url === 'string') {
    const response = await call('/media/background/apply', { method: 'POST', body: { url: input.url } });
    if (!response) return NextResponse.json({ message: 'Não foi possível trocar o fundo agora. Tente de novo.' }, { status: 502 });
    const body = await response.json().catch(() => ({}));
    return NextResponse.json(response.ok ? body : { message: message(body) ?? 'Não foi possível trocar o fundo agora.' }, { status: response.status });
  }
  return NextResponse.json({ message: 'Pedido inválido.' }, { status: 400 });
}
