import Link from 'next/link';
import { StatusBadge } from '../../../../components/admin/status-badge';
import { formatDateTime, orderStatusLabel, paymentMethodLabel } from '../../../../lib/admin/labels';
import { adminFetch } from '../../../../lib/admin/session';
import type { OrderPage } from '../../../../lib/admin/types';
import { formatPrice } from '../../../../lib/format';

export const dynamic = 'force-dynamic';
const filters = ['', ...Object.keys(orderStatusLabel)];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string; q?: string }> }) {
  const params = await searchParams;
  const status = filters.includes(params.status ?? '') ? params.status ?? '' : '';
  const q = (params.q ?? '').trim().slice(0, 120);
  const page = Math.max(Number(params.page) || 1, 1);
  const data = await adminFetch<OrderPage>('/orders?' + new URLSearchParams({
    page: String(page),
    pageSize: '25',
    ...(status && { status }),
    ...(q && { q }),
  }));
  const pages = Math.max(Math.ceil(data.total / data.pageSize), 1);
  const href = (next: Record<string, string>) => '/admin/pedidos?' + new URLSearchParams({
    ...(q && { q }),
    ...(status && { status }),
    ...next,
  });
  return (
    <>
      <h1 className="text-3xl font-bold">Pedidos</h1>
      <form method="get" className="card mt-6 flex flex-wrap gap-3 p-4">
        {status && <input type="hidden" name="status" value={status} />}
        <label className="sr-only" htmlFor="order-search">Buscar pedidos</label>
        <input id="order-search" name="q" defaultValue={q} maxLength={120} className="input min-w-[240px] flex-1" placeholder="Número do pedido, cliente ou e-mail" />
        <button className="button">Buscar</button>
        {q && <Link href={status ? '/admin/pedidos?status=' + status : '/admin/pedidos'} className="button-ghost">Limpar</Link>}
      </form>
      <div className="mt-5 flex flex-wrap gap-2">
        {filters.map(f => (
          <Link key={f || 'all'} href={f ? href({ status: f, page: '1' }) : href({ status: '', page: '1' })}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium ${f === status ? 'border-brand bg-brand text-white' : 'bg-surface'}`}>
            {f ? orderStatusLabel[f] : 'Todos'}
          </Link>
        ))}
      </div>
      <div className="card mt-6 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-5 py-3">Pedidos</th><th className="px-5 py-3">Cliente</th><th className="px-5 py-3">Pagamento</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Total</th><th className="px-5 py-3 text-right">Data</th></tr></thead>
          <tbody className="divide-y">
            {data.items.map(order => (
              <tr key={order.id} className="hover:bg-slate-50">
                <td className="px-5 py-3">
                  <Link href={`/admin/pedidos/${order.number}`} className="font-medium text-brand">STOREOS #{order.number}</Link>
                  <p className="text-xs text-slate-400">{order._count.items} item(ns)</p>
                  <p className="text-xs text-slate-500">Bling {order.blingSync?.blingOrderNumber ? '#' + order.blingSync.blingOrderNumber : order.blingSync?.status === 'FAILED' ? 'com erro' : order.blingSync ? 'na fila' : '—'}</p>
                </td>
                <td className="px-5 py-3">{order.customer?.name}<p className="text-xs text-slate-400">{order.customer?.email}</p></td>
                <td className="px-5 py-3">{order.payments.map(p => paymentMethodLabel[p.method] ?? p.method).join(', ') || '—'}</td>
                <td className="px-5 py-3"><StatusBadge status={order.status} /></td>
                <td className="px-5 py-3 text-right font-semibold">{formatPrice(order.total)}</td>
                <td className="px-5 py-3 text-right text-slate-500">{formatDateTime(order.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.items.length && <p className="p-8 text-center text-slate-500">{q ? 'Nenhum pedido encontrado para essa busca.' : 'Nenhum pedido encontrado.'}</p>}
      </div>
      {pages > 1 && <nav className="mt-6 flex justify-center gap-4 text-sm">{page > 1 && <Link href={href({ page: String(page - 1) })}>← Anterior</Link>}<span className="text-slate-500">Página {page} de {pages}</span>{page < pages && <Link href={href({ page: String(page + 1) })}>Próxima →</Link>}</nav>}
    </>
  );
}
