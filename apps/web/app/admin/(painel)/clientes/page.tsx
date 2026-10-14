import Link from 'next/link';
import { formatDateTime, segmentLabel, segmentTone } from '../../../../lib/admin/labels';
import { adminFetch } from '../../../../lib/admin/session';
import type { CustomerPage } from '../../../../lib/admin/types';
import { formatPrice } from '../../../../lib/format';

export const dynamic = 'force-dynamic';
const segments = ['', 'VIP', 'RECURRING', 'NEW', 'AT_RISK', 'PROSPECT'];

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; segment?: string; page?: string }> }) {
  const params = await searchParams;
  const segment = segments.includes(params.segment ?? '') ? params.segment ?? '' : '';
  const q = params.q?.slice(0, 100) ?? '';
  const page = Math.max(Number(params.page) || 1, 1);
  const data = await adminFetch<CustomerPage>(`/customers?${new URLSearchParams({ page: String(page), pageSize: '25', ...(segment && { segment }), ...(q && { q }) })}`);
  const pages = Math.max(Math.ceil(data.total / data.pageSize), 1);
  const href = (next: Record<string, string>) => `/admin/clientes?${new URLSearchParams({ ...(segment && { segment }), ...(q && { q }), ...next })}`;
  return (
    <>
      <h1 className="text-3xl font-bold">Clientes</h1>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {segments.map(s => <Link key={s} href={s ? `/admin/clientes?segment=${s}` : '/admin/clientes'} className={`rounded-full border px-4 py-1.5 text-sm font-medium ${s === segment ? 'border-brand bg-brand text-white' : 'bg-surface'}`}>{s ? `${segmentLabel[s]} (${data.segments[s as keyof typeof data.segments] ?? 0})` : 'Todos'}</Link>)}
        <form className="ml-auto"><input name="q" defaultValue={q} placeholder="Buscar por nome ou e-mail" className="input w-64" />{segment && <input type="hidden" name="segment" value={segment} />}</form>
      </div>
      <div className="card mt-6 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-5 py-3">Cliente</th><th className="px-5 py-3">Segmento</th><th className="px-5 py-3 text-right">Pedidos</th><th className="px-5 py-3 text-right">Total gasto</th><th className="px-5 py-3 text-right">Última compra</th></tr></thead>
          <tbody className="divide-y">{data.items.map(c => (
            <tr key={c.id} className="hover:bg-slate-50">
              <td className="px-5 py-3"><Link href={`/admin/clientes/${c.id}`} className="font-medium text-brand">{c.name}</Link><p className="text-xs text-slate-400">{c.email}</p></td>
              <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${segmentTone[c.segment]}`}>{segmentLabel[c.segment]}</span></td>
              <td className="px-5 py-3 text-right">{c.paidOrders}</td>
              <td className="px-5 py-3 text-right font-semibold">{formatPrice(c.totalSpent)}</td>
              <td className="px-5 py-3 text-right text-slate-500">{c.lastPaidAt ? formatDateTime(c.lastPaidAt) : '—'}</td>
            </tr>))}</tbody>
        </table>
        {!data.items.length && <p className="p-8 text-center text-slate-500">Nenhum cliente encontrado.</p>}
      </div>
      {pages > 1 && <nav className="mt-6 flex justify-center gap-4 text-sm">{page > 1 && <Link href={href({ page: String(page - 1) })}>← Anterior</Link>}<span className="text-slate-500">Página {page} de {pages}</span>{page < pages && <Link href={href({ page: String(page + 1) })}>Próxima →</Link>}</nav>}
    </>
  );
}
