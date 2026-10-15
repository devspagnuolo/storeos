import Link from 'next/link';
import { CampaignActions } from '../../../../../components/admin/campaign-actions';
import { CampaignForm } from '../../../../../components/admin/campaign-form';
import { audienceLabel, campaignStatus, formatDateTime, segmentLabel } from '../../../../../lib/admin/labels';
import { adminFetch } from '../../../../../lib/admin/session';
import type { EmailCampaignDetail } from '../../../../../lib/admin/types';
import { deleteCampaignAction } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await adminFetch<EmailCampaignDetail>(`/marketing/campaigns/${encodeURIComponent(id)}`);
  const draft = campaign.status === 'DRAFT';
  const { count } = draft ? await adminFetch<{ count: number }>(`/marketing/audience?${new URLSearchParams({ audience: campaign.audience, ...(campaign.segment && { segment: campaign.segment }) })}`) : { count: campaign.counts.total };
  const [label, tone] = campaignStatus[campaign.status];
  const c = campaign.counts;
  return (
    <>
      <Link href="/painel/campanhas" className="text-sm underline">← Campanhas</Link>
      <h1 className="mt-2 text-3xl font-bold">{campaign.name} <span className={`ml-2 align-middle rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span></h1>
      <p className="mt-1 text-sm text-slate-500">{audienceLabel[campaign.audience]}{campaign.segment ? ` (${segmentLabel[campaign.segment] ?? campaign.segment})` : ''}. {draft ? `Hoje são ${count} pessoa(s).` : campaign.startedAt ? `Iniciada em ${formatDateTime(campaign.startedAt)}.` : ''}</p>
      {!draft && (
        <div className="mt-6 grid gap-4 sm:grid-cols-4">
          {[['Destinatários', c.total], ['Enviados', c.sent], ['Faltam', c.pending], ['Falharam', c.failed]].map(([name, value]) => <div key={name} className="card p-4"><p className="text-xs uppercase text-slate-500">{name}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>)}
        </div>
      )}
      {c.simulated > 0 && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{c.simulated} e-mail(s) foram apenas simulados, porque a conta de envio (RESEND_API_KEY) não está configurada. Ninguém recebeu de verdade.</p>}
      {campaign.failures.length > 0 && <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-900"><p className="font-medium">Não foi possível enviar para:</p><ul className="mt-1 list-disc pl-5">{campaign.failures.map(f => <li key={f.email}>{f.email}{f.error ? ` (${f.error})` : ''}</li>)}</ul></div>}
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="card p-6">
          <h2 className="mb-4 text-lg font-bold">{draft ? 'Mensagem' : 'Mensagem enviada'}</h2>
          {draft ? <CampaignForm campaign={campaign} /> : <><p className="text-sm"><strong>Assunto:</strong> {campaign.subject}</p><pre className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm">{campaign.body}</pre></>}
        </section>
        <section className="card h-fit p-6">
          <h2 className="mb-4 text-lg font-bold">{draft ? 'Enviar' : 'Envio'}</h2>
          <CampaignActions id={campaign.id} status={campaign.status} audienceCount={count} />
          {campaign.status !== 'SENDING' && (
            <form action={deleteCampaignAction} className="mt-6 border-t pt-4"><input type="hidden" name="id" value={campaign.id} /><button className="text-xs text-red-700 underline">Excluir campanha</button></form>
          )}
        </section>
      </div>
    </>
  );
}
