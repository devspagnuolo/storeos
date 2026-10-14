import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACCESS_COOKIE, serverApiUrl } from '../../../../../lib/admin/session';

export const dynamic = 'force-dynamic';

/** Andamento da importação, lido de tempos em tempos pela tela do Bling. */
export async function GET() {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return NextResponse.json({ message: 'Sessão expirada' }, { status: 401 });
  const response = await fetch(`${serverApiUrl}/bling/status`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' }).catch(() => undefined);
  if (!response) return NextResponse.json({ message: 'Indisponível' }, { status: 502 });
  return NextResponse.json(await response.json().catch(() => ({})), { status: response.status });
}
