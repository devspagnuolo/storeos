import Link from 'next/link';
import { StatusBadge } from '../../../../components/admin/status-badge';
import { formatDateTime, orderStatusLabel, paymentMethodLabel } from '../../../../lib/admin/labels';
import { adminFetch } from '../../../../lib/admin/session';
import type { OrderPage } from '../../../../lib/admin/types';
import { formatPrice } from '../../../../lib/format';

export const dynamic = 'force-dynamic';
const filters = ['', 'AWAITING_PAYMENT', 'PAID', 'CANCELLED'];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const params = await searchParams;
  const status = filters.includes(params.status ?? '') ? params.status ?? '' : '';
  const page = Math.max(Number(params.page) || 1, 1);
  const data = await adminFetch<OrderPage>(`/orders?${new URLSearchParams({ page: String(page), pageSize: '25', ...(status && { status }) })}`);
  const pages = Math.max(Math.ceil(data.total / data.pageSize), 1);
  const href = (next: Record<string, string>) => `/admin/pedidos?${new URLSearchParams({ ...(status && { status }), ...next })}`;
  return (
    <>
      <h1 className="text-3xl font-bold">Pedidos</h1>
      <div className="mt-6 flex flex-wrap gap-2">{filters.map(f => <Link key={f} href={f ? `/admin/pedidos?status=${f}` : '/admin/pedidos'} className={`rounded-full border px-4 py-1.5 text-sm font-medium ${f === status ? 'border-brand bg-brand text-white' : 'bg-white'}`}>{f ? orderStatusLabel[f] : 'Todos'}</Link>)}</div>
      <div className="card mt-6 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-5 py-3">Pedido</th><th className="px-5 py-3">Cliente</th><th className="px-5 py-3">Pagamento</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Total</th><th className="px-5 py-3 text-right">Data</th></tr></thead>
          <tbody className="divide-y">
            {data.items.map(order => (
              <tr key={order.id} className="hover:bg-slate-50">
                <td className="px-5 py-3"><Link href={`/admin/pedidos/${order.number}`} className="font-medium text-brand">{order.number}</Link><p className="text-xs text-slate-400">{order._count.items} item(ns)</p></td>
                <td className="px-5 py-3">{order.customer?.name}<p className="text-xs text-slate-400">{order.customer?.email}</p></td>
                <td className="px-5 py-3">{order.payments.map(p => paymentMethodLabel[p.method] ?? p.method).join(', ')}</td>
                <td className="px-5 py-3"><StatusBadge status={order.status} /></td>
                <td className="px-5 py-3 text-right font-semibold">{formatPrice(order.total)}</td>
                <td className="px-5 py-3 text-right text-slate-500">{formatDateTime(order.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.items.length && <p className="p-8 text-center text-slate-500">Nenhum pedido encontrado.</p>}
      </div>
      {pages > 1 && <nav className="mt-6 flex justify-center gap-4 text-sm">{page > 1 && <Link href={href({ page: String(page - 1) })}>← Anterior</Link>}<span className="text-slate-500">Página {page} de {pages}</span>{page < pages && <Link href={href({ page: String(page + 1) })}>Próxima →</Link>}</nav>}
    </>
  );
}
