import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, serverApiUrl } from '../../../../lib/admin/session';

export const dynamic = 'force-dynamic';

/** Busca de produtos cadastrados para o editor da vitrine: por texto, ou pelos ids já escolhidos. */
export async function GET(request: NextRequest) {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return NextResponse.json({ message: 'Sessão expirada' }, { status: 401 });
  const query = new URLSearchParams({ pageSize: '12', status: 'ACTIVE' });
  const ids = request.nextUrl.searchParams.get('ids');
  if (ids) { query.set('ids', ids.slice(0, 1000)); query.delete('status'); query.set('pageSize', '24'); }
  const q = request.nextUrl.searchParams.get('q');
  if (q) query.set('q', q.slice(0, 100));
  const page = Number(request.nextUrl.searchParams.get('page'));
  if (Number.isInteger(page) && page > 0) query.set('page', String(page));
  const response = await fetch(`${serverApiUrl}/catalog/admin/products?${query}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' }).catch(() => undefined);
  if (!response) return NextResponse.json({ message: 'Indisponível' }, { status: 502 });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return NextResponse.json(body, { status: response.status });
  const items = (body.items ?? []).map((p: { id: string; name: string; sku: string; price: string; status: string; images: { url: string }[] }) => ({ id: p.id, name: p.name, sku: p.sku, price: p.price, status: p.status, imageUrl: p.images?.[0]?.url ?? null }));
  return NextResponse.json({ items, page: body.page, total: body.total, pageSize: body.pageSize });
}
