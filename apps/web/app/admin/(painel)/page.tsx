import Link from 'next/link';
import { StatusBadge } from '../../../components/admin/status-badge';
import { formatDateTime } from '../../../lib/admin/labels';
import { adminFetch } from '../../../lib/admin/session';
import type { OrderPage, Summary } from '../../../lib/admin/types';
import { formatPrice } from '../../../lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const [summary, recent] = await Promise.all([adminFetch<Summary>('/orders/summary'), adminFetch<OrderPage>('/orders?pageSize=8')]);
  const metrics: [string, string, string?][] = [
    ['Receita', formatPrice(summary.revenue), `${summary.paidOrders} pedidos pagos`],
    ['Pedidos', String(summary.orders), `${summary.awaitingPayment} aguardando pagamento`],
    ['Pagamento concluído', `${summary.paymentRate.toLocaleString('pt-BR')}%`, 'dos pedidos criados'],
    ['Ticket médio', formatPrice(summary.averageTicket)],
  ];
  return (
    <>
      <p className="text-sm font-semibold text-brand">ÚLTIMOS {summary.days} DIAS</p>
      <h1 className="mt-1 text-3xl font-bold">Visão geral</h1>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(([label, value, hint]) => <div className="card p-5" key={label}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p>{hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}</div>)}
      </div>
      {summary.lowStockProducts > 0 && <Link href="/admin/produtos" className="mt-6 block rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{summary.lowStockProducts} produto(s) publicado(s) com 3 unidades ou menos em estoque.</Link>}
      <div className="card mt-8 overflow-hidden">
        <div className="flex items-center justify-between p-5"><h2 className="font-bold">Pedidos recentes</h2><Link href="/admin/pedidos" className="text-sm font-medium text-brand">Ver todos →</Link></div>
        {recent.items.length ? (
          <table className="w-full text-sm">
            <tbody className="divide-y">{recent.items.map(order => <tr key={order.id}><td className="px-5 py-3"><Link href={`/admin/pedidos/${order.number}`} className="font-medium hover:text-brand">{order.number}</Link></td><td className="px-5 py-3 text-slate-500">{order.customer?.name}</td><td className="px-5 py-3"><StatusBadge status={order.status} /></td><td className="px-5 py-3 text-right font-semibold">{formatPrice(order.total)}</td><td className="hidden px-5 py-3 text-right text-slate-400 md:table-cell">{formatDateTime(order.createdAt)}</td></tr>)}</tbody>
          </table>
        ) : <p className="px-5 pb-6 text-slate-500">Nenhum pedido ainda.</p>}
      </div>
    </>
  );
}
