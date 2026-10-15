'use client';
import { useActionState } from 'react';
import { cancelCampaignAction, sendCampaignAction, testCampaignAction, type FormState } from '../../app/admin/actions';

function Message({ state }: { state: FormState }) {
  return <>{state.error && <p role="alert" className="mt-2 text-sm text-red-700">{state.error}</p>}{state.ok && <p role="status" className="mt-2 text-sm text-emerald-700">{state.ok}</p>}</>;
}

/** Teste, envio e cancelamento. Enviar para todos pede confirmação com o número de destinatários. */
export function CampaignActions({ id, status, audienceCount }: { id: string; status: string; audienceCount: number }) {
  const [testState, test, testing] = useActionState(testCampaignAction, {});
  const [sendState, send, sending] = useActionState(sendCampaignAction, {});
  const [cancelState, cancel, cancelling] = useActionState(cancelCampaignAction, {});
  if (status === 'SENDING') {
    return (
      <form action={cancel}><input type="hidden" name="id" value={id} />
        <button className="rounded-xl border px-4 py-2 text-sm disabled:opacity-60" disabled={cancelling}>{cancelling ? 'Cancelando…' : 'Cancelar o envio'}</button>
        <p className="mt-2 text-xs text-slate-500">Quem já recebeu não é afetado; os que faltam deixam de ser enviados.</p><Message state={cancelState} />
      </form>
    );
  }
  if (status !== 'DRAFT') return null;
  return (
    <div className="space-y-5">
      <form action={test} className="flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={id} />
        <label className="text-sm font-medium">Enviar um teste para<input name="email" type="email" required className="input !mt-1 w-64" placeholder="seu@email.com" /></label>
        <button className="rounded-xl border px-4 py-2 text-sm disabled:opacity-60" disabled={testing}>{testing ? 'Enviando…' : 'Enviar teste'}</button>
        <div className="w-full"><Message state={testState} /></div>
      </form>
      <form action={send} onSubmit={e => { if (!window.confirm(`Enviar esta campanha para ${audienceCount} pessoa(s)? Depois de iniciado, só dá para cancelar o que ainda não saiu.`)) e.preventDefault(); }}>
        <input type="hidden" name="id" value={id} />
        <button className="button disabled:opacity-60" disabled={sending || audienceCount === 0}>{sending ? 'Iniciando…' : `Enviar para ${audienceCount} pessoa(s)`}</button>
        <p className="mt-2 text-xs text-slate-500">Salve o rascunho antes. Mande um teste primeiro para conferir o texto e o link de sair da lista.</p><Message state={sendState} />
      </form>
    </div>
  );
}
