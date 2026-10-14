import { RevenueChart } from '../../../../components/admin/revenue-chart';
import { StatCard } from '../../../../components/ui/stat-card';
import { adminFetch } from '../../../../lib/admin/session';
import type { SalesReport } from '../../../../lib/admin/types';
import { formatPrice } from '../../../../lib/format';

export const dynamic = 'force-dynamic';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.from && DATE.test(params.from)) query.set('from', params.from);
  if (params.to && DATE.test(params.to)) query.set('to', params.to);
  const r = await adminFetch<SalesReport>(`/analytics/sales?${query}`);
  const top = r.funnel[0]?.count || 1;
  return (
    <>
      <h1 className="text-3xl font-bold">Relatórios de vendas</h1>
      <form className="mt-6 flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium">De<input type="date" name="from" defaultValue={r.from} className="input" /></label>
        <label className="text-sm font-medium">Até<input type="date" name="to" defaultValue={r.to} className="input" /></label>
        <button className="button">Atualizar</button>
      </form>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Receita" value={formatPrice(r.totals.revenue)} hint="pedidos pagos no período" />
        <StatCard label="Pedidos pagos" value={String(r.totals.orders)} hint={`${r.totals.buyers} cliente(s) compraram`} />
        <StatCard label="Ticket médio" value={formatPrice(r.totals.averageTicket)} />
        <StatCard label="Descontos dados" value={formatPrice(r.totals.discount)} hint={`${r.totals.newCustomers} cliente(s) novo(s)`} />
      </div>
      <section className="card mt-6 p-5"><h2 className="mb-3 font-bold">Receita por dia</h2><RevenueChart series={r.series} /></section>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-bold">Funil de pedidos</h2>
          <ul className="mt-4 space-y-3 text-sm">{r.funnel.map(step => (
            <li key={step.stage}><div className="flex justify-between"><span>{step.stage}</span><b>{step.count}</b></div><div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand" style={{ width: `${Math.round((step.count / top) * 100)}%` }} /></div></li>))}</ul>
          <p className="mt-4 text-xs text-slate-500">{r.cancelled} cancelado(s) · {r.returned} devolvido(s)</p>
        </section>
        <section className="card overflow-hidden">
          <h2 className="p-5 font-bold">Produtos mais vendidos</h2>
          <table className="w-full text-sm"><tbody className="divide-y">{r.topProducts.map(p => <tr key={p.sku}><td className="px-5 py-3">{p.name}<p className="text-xs text-slate-400">SKU {p.sku}</p></td><td className="px-5 py-3 text-right">{p.quantity} un.</td><td className="px-5 py-3 text-right font-semibold">{formatPrice(p.revenue)}</td></tr>)}</tbody></table>
          {!r.topProducts.length && <p className="p-6 text-center text-slate-500">Sem vendas no período.</p>}
        </section>
      </div>
      {r.coupons.length > 0 && (
        <section className="card mt-6 overflow-hidden">
          <h2 className="p-5 font-bold">Cupons usados</h2>
          <table className="w-full text-sm"><tbody className="divide-y">{r.coupons.map(c => <tr key={c.code}><td className="px-5 py-3 font-mono font-semibold">{c.code}</td><td className="px-5 py-3 text-right">{c.uses} uso(s)</td><td className="px-5 py-3 text-right">{formatPrice(c.discount)} em descontos</td></tr>)}</tbody></table>
        </section>
      )}
    </>
  );
}
