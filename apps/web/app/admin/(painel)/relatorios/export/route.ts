import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, serverApiUrl } from '../../../../../lib/admin/session';

export const dynamic = 'force-dynamic';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Baixa a planilha de pedidos do período autenticando com o cookie da sessão do painel. */
export async function GET(request: NextRequest) {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return NextResponse.redirect(new URL('/admin/login', process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'));
  const query = new URLSearchParams();
  for (const key of ['from', 'to']) { const value = request.nextUrl.searchParams.get(key); if (value && DATE.test(value)) query.set(key, value); }
  const response = await fetch(`${serverApiUrl}/analytics/orders.csv?${query}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) return new NextResponse('Não foi possível gerar a planilha agora.', { status: response.status });
  return new NextResponse(await response.text(), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="pedidos.csv"' } });
}
