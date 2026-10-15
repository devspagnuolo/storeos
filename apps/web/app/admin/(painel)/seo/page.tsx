import Link from 'next/link';
import { TrackingForm } from '../../../../components/admin/tracking-form';
import { adminFetch } from '../../../../lib/admin/session';
import type { SeoAudit, TrackingConfig } from '../../../../lib/admin/types';

export const dynamic = 'force-dynamic';

export default async function SeoPage() {
  const [config, audit] = await Promise.all([adminFetch<TrackingConfig>('/seo/tracking'), adminFetch<SeoAudit>('/seo/audit')]);
  return (
    <>
      <h1 className="text-3xl font-bold">Google e anúncios</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">Faça a loja aparecer melhor no Google e meça as vendas de anúncios. A loja já publica sozinha o mapa do site (sitemap), os dados de produto para o Google e o endereço oficial de cada página.</p>
      <section className="card mt-6 p-6">
        <h2 className="text-lg font-bold">Checklist</h2>
        <ul className="mt-3 space-y-2 text-sm">{audit.checks.map(c => (
          <li key={c.id} className="flex gap-3"><span aria-hidden className={c.ok ? 'text-emerald-600' : 'text-amber-600'}>{c.ok ? '✓' : '!'}</span><span><b>{c.label}</b>{!c.ok && <span className="block text-slate-500">{c.hint}</span>}</span></li>))}</ul>
      </section>
      <section className="card mt-6 p-6"><h2 className="mb-4 text-lg font-bold">Textos do Google e códigos de medição</h2><TrackingForm config={config} /></section>
      <section className="card mt-6 p-6">
        <h2 className="text-lg font-bold">Páginas de produto</h2>
        {audit.products.total === 0 ? <p className="mt-2 text-sm text-slate-500">Nenhum produto ativo ainda.</p> : (
          <>
            <p className="mt-2 text-sm text-slate-600">{audit.products.withIssues === 0 ? `Os ${audit.products.total} produtos ativos estão completos.` : `${audit.products.withIssues} de ${audit.products.total} produtos ativos têm algo a melhorar.`}</p>
            {audit.products.withIssues > 0 && (
              <>
                <ul className="mt-3 flex flex-wrap gap-2 text-xs">{audit.products.counts.filter(c => c.count > 0).map(c => <li key={c.key} className="rounded-full bg-amber-50 px-3 py-1 text-amber-900">{c.label}: {c.count}</li>)}</ul>
                <table className="mt-4 w-full text-sm"><tbody className="divide-y">{audit.list.map(p => (
                  <tr key={p.id}><td className="py-2 pr-4"><Link href={`/painel/produtos/${p.id}`} className="font-medium underline">{p.name}</Link></td><td className="py-2 text-xs text-slate-500">{p.labels.join(' · ')}</td></tr>))}</tbody></table>
                {audit.products.withIssues > audit.list.length && <p className="mt-2 text-xs text-slate-400">Mostrando os {audit.list.length} mais importantes.</p>}
              </>)}
          </>)}
      </section>
    </>
  );
}
