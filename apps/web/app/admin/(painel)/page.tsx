import Link from 'next/link';
import { StatusBadge } from '../../../components/admin/status-badge';
import { formatDateTime } from '../../../lib/admin/labels';
import { adminFetch } from '../../../lib/admin/session';
import type { OrderPage, Summary } from '../../../lib/admin/types';
import { formatPrice } from '../../../lib/format';
import { EmptyState } from '../../../components/ui/empty-state';
import { PageHeader } from '../../../components/ui/page-header';
import { StatCard } from '../../../components/ui/stat-card';

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
      <PageHeader eyebrow={`Últimos ${summary.days} dias`} title="Visão geral" description="Resumo das vendas e do que precisa da sua atenção hoje." />
      <Link href="/painel/primeiros-passos" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-100 bg-violet-50 p-5"><span><strong className="block text-slate-900">Prepare sua loja para vender</strong><span className="mt-1 block text-sm text-slate-600">Confira o catálogo, a vitrine, as entregas e o recebimento.</span></span><span className="text-sm font-semibold text-brand">Continuar configuração →</span></Link>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(([label, value, hint]) => <StatCard key={label} label={label} value={value} hint={hint} />)}
      </div>
      {summary.lowStockProducts > 0 && <Link href="/admin/produtos" className="mt-6 block rounded-xl bg-amber-50 p-4 text-sm font-medium text-amber-800">{summary.lowStockProducts} produto(s) publicado(s) com 3 unidades ou menos em estoque.</Link>}
      <div className="card mt-8 overflow-hidden">
        <div className="flex items-center justify-between p-5"><h2 className="font-bold">Pedidos recentes</h2><Link href="/admin/pedidos" className="text-sm font-medium text-brand">Ver todos →</Link></div>
        {recent.items.length ? (
          <table className="w-full text-sm">
            <tbody className="divide-y">{recent.items.map(order => <tr key={order.id}><td className="px-5 py-3"><Link href={`/admin/pedidos/${order.number}`} className="font-medium hover:text-brand">{order.number}</Link></td><td className="px-5 py-3 text-slate-500">{order.customer?.name}</td><td className="px-5 py-3"><StatusBadge status={order.status} /></td><td className="px-5 py-3 text-right font-semibold">{formatPrice(order.total)}</td><td className="hidden px-5 py-3 text-right text-slate-400 md:table-cell">{formatDateTime(order.createdAt)}</td></tr>)}</tbody>
          </table>
        ) : <EmptyState title="Nenhum pedido ainda" description="Quando alguém comprar na sua loja, o pedido aparece aqui." action={{ href: '/painel/primeiros-passos', label: 'Preparar a loja para vender' }} />}
      </div>
    </>
  );
}
