import Link from 'next/link';
import { CampaignForm } from '../../../../components/admin/campaign-form';
import { audienceLabel, campaignStatus, formatDateTime, segmentLabel } from '../../../../lib/admin/labels';
import { adminFetch } from '../../../../lib/admin/session';
import type { EmailCampaign } from '../../../../lib/admin/types';

export const dynamic = 'force-dynamic';

export default async function CampaignsPage() {
  const campaigns = await adminFetch<EmailCampaign[]>('/marketing/campaigns');
  return (
    <>
      <h1 className="text-3xl font-bold">Campanhas de e-mail</h1>
      <p className="mt-1 text-sm text-slate-500">Envie novidades e promoções para quem aceitou receber. Todo e-mail leva o link para a pessoa sair da lista, e quem sai nunca mais recebe.</p>
      <div className="mt-8 grid gap-6 lg:grid-cols-[420px_1fr]">
        <section className="card h-fit p-6"><h2 className="mb-4 text-lg font-bold">Nova campanha</h2><CampaignForm /></section>
        <section className="card overflow-hidden">
          {campaigns.length === 0 ? <p className="p-8 text-center text-slate-500">Nenhuma campanha ainda.</p> : (
            <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Campanha</th><th>Público</th><th>Situação</th><th>Enviados</th></tr></thead>
              <tbody className="divide-y">{campaigns.map(c => {
                const [label, tone] = campaignStatus[c.status];
                return (
                  <tr key={c.id}>
                    <td className="px-5 py-3"><Link href={`/painel/campanhas/${c.id}`} className="font-semibold underline">{c.name}</Link><span className="block text-xs text-slate-400">{formatDateTime(c.startedAt ?? c.createdAt)}</span></td>
                    <td className="text-xs">{audienceLabel[c.audience]}{c.segment && <span className="block text-slate-400">{segmentLabel[c.segment] ?? c.segment}</span>}</td>
                    <td><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span></td>
                    <td>{c.counts.total ? `${c.counts.sent} de ${c.counts.total}` : '—'}{c.counts.failed > 0 && <span className="block text-xs text-red-700">{c.counts.failed} falharam</span>}</td>
                  </tr>);
              })}</tbody></table>)}
        </section>
      </div>
    </>
  );
}
