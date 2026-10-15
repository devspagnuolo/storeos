import Link from 'next/link';
import { adminFetch } from '../../../../../lib/admin/session';
import type { CampaignCode } from '../../../../../lib/admin/types';

export const dynamic = 'force-dynamic';

export default async function CampaignPage({ searchParams }: { searchParams: Promise<{ nome?: string }> }) {
  const name = ((await searchParams).nome ?? '').slice(0, 60);
  const codes = name ? await adminFetch<CampaignCode[]>(`/coupons/campaigns/${encodeURIComponent(name)}`) : [];
  const csv = `codigo,usado\n${codes.map(c => `${c.code},${c.used ? 'sim' : 'nao'}`).join('\n')}\n`;
  return (
    <>
      <Link href="/painel/cupons" className="text-sm underline">← Cupons</Link>
      <h1 className="mt-2 text-3xl font-bold">{name || 'Campanha'}</h1>
      <p className="mt-1 text-sm text-slate-500">{codes.length} códigos, {codes.filter(c => c.used).length} já usados. Cada um vale uma vez só.</p>
      {codes.length > 0 && (
        <>
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`} download={`campanha-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`} className="button-ghost mt-4 inline-block">Baixar lista (CSV)</a>
          <section className="card mt-6 overflow-hidden">
            <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Código</th><th>Situação</th></tr></thead>
              <tbody className="divide-y">{codes.map(c => (
                <tr key={c.id}><td className="px-5 py-2 font-mono font-semibold">{c.code}</td><td>{c.used ? 'Usado' : c.active ? 'Disponível' : 'Desativado'}</td></tr>))}</tbody></table>
          </section>
        </>)}
    </>
  );
}
