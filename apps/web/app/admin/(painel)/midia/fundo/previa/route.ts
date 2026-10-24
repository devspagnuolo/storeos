import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACCESS_COOKIE, serverApiUrl } from '../../../../../../lib/admin/session';

export const dynamic = 'force-dynamic';

/** Prévia do fundo (silhueta de exemplo) com as escolhas ainda não salvas do formulário. Não gasta crédito do Photoroom. */
export async function GET(request: Request) {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return NextResponse.json({ message: 'Sessão expirada. Entre novamente.' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const floor = Number(params.get('floor'));
  const body = {
    style: params.get('style') ?? 'studio',
    color: params.get('color') ?? '#F2F2F2',
    shadow: params.get('shadow') !== 'false',
    ...(params.get('imageUrl') && { imageUrl: params.get('imageUrl') }),
    ...(Number.isFinite(floor) && floor > 0 && { floor }),
  };
  const response = await fetch(`${serverApiUrl}/media/background/preview`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' }).catch(() => undefined);
  if (!response?.ok) return NextResponse.json({ message: 'Prévia indisponível.' }, { status: response?.status ?? 502 });
  return new NextResponse(await response.arrayBuffer(), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'no-store' } });
}
