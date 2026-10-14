import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACCESS_COOKIE, serverApiUrl } from '../../../../../lib/admin/session';

export const dynamic = 'force-dynamic';

/** Baixa o catálogo em CSV autenticando com o cookie da sessão do painel. */
export async function GET() {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return NextResponse.redirect(new URL('/admin/login', process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'));
  const response = await fetch(`${serverApiUrl}/catalog/admin/export.csv`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) return new NextResponse('Não foi possível gerar a planilha agora.', { status: response.status });
  return new NextResponse(await response.text(), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="produtos.csv"' } });
}
