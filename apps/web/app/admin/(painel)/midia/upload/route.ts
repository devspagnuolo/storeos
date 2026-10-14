import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACCESS_COOKIE, serverApiUrl } from '../../../../../lib/admin/session';

export const dynamic = 'force-dynamic';

/** Recebe as imagens do navegador (arquivos do computador do lojista) e repassa à API com a sessão do painel. */
export async function POST(request: Request) {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return NextResponse.json({ message: 'Sessão expirada. Entre novamente.' }, { status: 401 });
  const kind = new URL(request.url).searchParams.get('kind') ?? 'other';
  const response = await fetch(`${serverApiUrl}/media/upload?kind=${encodeURIComponent(kind)}`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: await request.formData(), cache: 'no-store' }).catch(() => undefined);
  if (!response) return NextResponse.json({ message: 'Não foi possível enviar agora. Tente de novo.' }, { status: 502 });
  const body = await response.json().catch(() => ({}));
  return NextResponse.json(Array.isArray(body.message) ? { message: 'Confira as imagens enviadas.' } : body, { status: response.status });
}
