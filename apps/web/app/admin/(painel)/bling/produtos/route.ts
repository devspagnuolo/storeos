import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, serverApiUrl } from '../../../../../lib/admin/session';

export const dynamic = 'force-dynamic';

/** Cadastros ativos do Bling para a tela de escolha de produtos. */
export async function GET(request: NextRequest) {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return NextResponse.json({ message: 'Sessão expirada' }, { status: 401 });
  const query = new URLSearchParams();
  const page = Number(request.nextUrl.searchParams.get('page'));
  if (Number.isInteger(page) && page > 0) query.set('page', String(page));
  const q = request.nextUrl.searchParams.get('q');
  if (q) query.set('q', q.slice(0, 100));
  const response = await fetch(`${serverApiUrl}/bling/products?${query}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' }).catch(() => undefined);
  if (!response) return NextResponse.json({ message: 'Indisponível' }, { status: 502 });
  return NextResponse.json(await response.json().catch(() => ({})), { status: response.status });
}
