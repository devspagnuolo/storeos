'use client';
import { useActionState, useState } from 'react';
import { saveCampaignAction } from '../../app/admin/actions';
import { audienceLabel, segmentLabel } from '../../lib/admin/labels';
import type { EmailCampaign } from '../../lib/admin/types';

export function CampaignForm({ campaign }: { campaign?: EmailCampaign }) {
  const [state, action, pending] = useActionState(saveCampaignAction, {});
  const [audience, setAudience] = useState<string>(campaign?.audience ?? 'ALL');
  return (
    <form action={action} className="space-y-4 text-sm">
      {campaign && <input type="hidden" name="id" value={campaign.id} />}
      <label className="block font-medium">Nome (só você vê)<input name="name" required minLength={2} maxLength={80} defaultValue={campaign?.name} className="input" placeholder="Coleção de verão" /></label>
      <label className="block font-medium">Assunto do e-mail<input name="subject" required minLength={3} maxLength={150} defaultValue={campaign?.subject} className="input" placeholder="{{nome}}, chegou a coleção nova" /></label>
      <label className="block font-medium">Mensagem
        <textarea name="body" required minLength={10} maxLength={8000} rows={10} defaultValue={campaign?.body} className="input font-mono" placeholder={'Oi {{nome}}!\n\nA coleção nova chegou. Use o cupom VERAO10 e ganhe 10% de desconto.\n\nhttps://sualoja.com.br/colecoes/verao'} />
        <span className="mt-1 block text-xs font-normal text-slate-500">Use <code className="rounded bg-slate-100 px-1">{'{{nome}}'}</code> (primeiro nome) e <code className="rounded bg-slate-100 px-1">{'{{loja}}'}</code>. Linhas em branco separam parágrafos e endereços de site viram link. O rodapé com o link para sair da lista é incluído sozinho.</span>
      </label>
      <label className="block font-medium">Quem recebe
        <select name="audience" value={audience} onChange={e => setAudience(e.target.value)} className="input">{Object.entries(audienceLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      </label>
      {audience !== 'NEWSLETTER' && (
        <label className="block font-medium">Tipo de cliente (opcional)
          <select name="segment" defaultValue={campaign?.segment ?? ''} className="input"><option value="">Todos</option>{Object.entries(segmentLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <span className="mt-1 block text-xs font-normal text-slate-500">Ao escolher um tipo, a newsletter fica de fora: só clientes daquele tipo recebem.</span>
        </label>
      )}
      {state.error && <p role="alert" className="text-red-700">{state.error}</p>}
      {state.ok && <p role="status" className="text-emerald-700">{state.ok}</p>}
      <button className="button disabled:opacity-60" disabled={pending}>{pending ? 'Salvando…' : campaign ? 'Salvar rascunho' : 'Criar rascunho'}</button>
    </form>
  );
}
