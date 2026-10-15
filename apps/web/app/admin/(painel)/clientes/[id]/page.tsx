import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LoyaltyPanel } from '../../../../../components/admin/loyalty-panel';
import { CustomerNotes } from '../../../../../components/admin/customer-notes';
import { CustomerEditor } from '../../../../../components/admin/customer-editor';
import { StatusBadge } from '../../../../../components/admin/status-badge';
import { formatDateTime, segmentLabel, segmentTone } from '../../../../../lib/admin/labels';
import { adminFetch, ApiError } from '../../../../../lib/admin/session';
import type { CustomerProfile, LoyaltySummary } from '../../../../../lib/admin/types';
import { formatPrice } from '../../../../../lib/format';

export const dynamic = 'force-dynamic';

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await adminFetch<CustomerProfile>(`/customers/${encodeURIComponent(id)}`).catch(error => { if (error instanceof ApiError && error.status === 404) notFound(); throw error; });
  const loyalty = await adminFetch<LoyaltySummary>(`/loyalty/customers/${encodeURIComponent(id)}`);
  // Ajustar e resgatar exige marketing.write; sem a permissão a API responde 403 e o painel só mostra o saldo.
  const canEdit = await adminFetch('/coupons').then(() => true, () => false);
  const stat = (label: string, value: string) => <div className="card p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div>;
  return (
    <>
      <Link href="/admin/clientes" className="text-sm text-slate-500">← Clientes</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold">{c.name}</h1><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${segmentTone[c.stats.segment]}`}>{segmentLabel[c.stats.segment]}</span></div>
      <p className="mt-1 text-sm text-slate-500">{c.email} · cliente desde {formatDateTime(c.createdAt)}</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stat('Valor total (LTV)', formatPrice(c.stats.ltv))}{stat('Pedidos pagos', String(c.stats.paidOrders))}{stat('Ticket médio', formatPrice(c.stats.averageTicket))}{stat('Última compra', c.stats.lastPurchaseAt ? `${formatDateTime(c.stats.lastPurchaseAt)} (${c.stats.daysSinceLastPurchase === 0 ? 'hoje' : `há ${c.stats.daysSinceLastPurchase} dias`})` : '—')}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
        <span>Compra, em média, a cada <b>{c.stats.averageDaysBetweenOrders === null ? '—' : `${c.stats.averageDaysBetweenOrders} dias`}</b></span>
        <span>Categorias preferidas: <b>{c.favoriteCategories.length ? c.favoriteCategories.map(f => `${f.name} (${f.quantity})`).join(', ') : '—'}</b></span>
        <span>Newsletter: <b>{!c.newsletter ? 'não inscrito' : c.newsletter.subscribed ? 'inscrito' : 'cancelou'}</b></span>
        <span>Marketing: <b>{c.marketingOptIn ? 'autorizado' : 'não autorizado'}</b></span>
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="card overflow-hidden">
          <h2 className="p-5 font-bold">Histórico de pedidos</h2>
          <table className="w-full text-sm"><tbody className="divide-y">{c.orders.map(o => <tr key={o.id}><td className="px-5 py-3"><Link href={`/admin/pedidos/${o.number}`} className="font-medium text-brand">{o.number}</Link>{o.couponCode && <span className="ml-2 text-xs text-slate-400">cupom {o.couponCode}</span>}</td><td className="px-5 py-3"><StatusBadge status={o.status} /></td><td className="px-5 py-3 text-right font-semibold">{formatPrice(o.total)}</td><td className="px-5 py-3 text-right text-slate-500">{formatDateTime(o.createdAt)}</td></tr>)}</tbody></table>
          {!c.orders.length && <p className="p-6 text-center text-slate-500">Sem pedidos.</p>}
          <h2 className="border-t p-5 font-bold">Linha do tempo</h2>
          <ol className="divide-y text-sm">{c.timeline.map((e, i) => <li key={i} className="flex gap-3 px-5 py-3"><span className="w-28 shrink-0 text-xs text-slate-400">{formatDateTime(e.at)}</span><div><p className="font-medium">{e.ref ? <Link href={`/admin/pedidos/${e.ref}`} className="text-brand">{e.title}</Link> : e.title}</p>{e.detail && <p className="whitespace-pre-wrap text-xs text-slate-500">{e.detail}</p>}</div></li>)}</ol>
        </section>
        <div className="space-y-6"><CustomerNotes customer={c} /><LoyaltyPanel customerId={c.id} loyalty={loyalty} canEdit={canEdit} /><CustomerEditor customer={c} /></div>
      </div>
    </>
  );
}
