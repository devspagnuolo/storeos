'use client';
import { useActionState, useState } from 'react';
import { getPublicationConfigAction, restoreStorefrontAction, type FormState } from '../../app/admin/actions';
import type { StorefrontConfig } from '../../lib/api';
import type { StorefrontState } from '../../lib/admin/storefront';
import { diffConfigs } from '../../lib/storefront-diff';

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="text-sm text-red-700">{state.error}</p>;
  if (state.ok) return <p role="status" className="text-sm text-emerald-700">{state.ok}</p>;
  return null;
}

export function StorefrontHistory({ state }: { state: StorefrontState }) {
  const [feedback, restore, pending] = useActionState(restoreStorefrontAction, {});
  const [diff, setDiff] = useState<{ id: string; lines: string[]; error?: string } | null>(null);

  async function compare(id: string) {
    const result = await getPublicationConfigAction(id);
    if (result.error) return setDiff({ id, lines: [], error: result.error });
    // De: versão do histórico. Para: o que está no ar hoje. Mostra o que mudaria ao voltar para ela.
    setDiff({ id, lines: diffConfigs(state.published ?? {}, result.config as StorefrontConfig) });
  }

  return <section className="card mt-8 p-6"><h2 className="text-lg font-bold">Histórico de publicações</h2><p className="mt-1 text-sm text-slate-500">Compare com o que está no ar e recupere uma versão como rascunho para revisar antes de publicar. Exibindo as últimas 20 versões.</p><Feedback state={feedback} />
    {state.publications.length === 0 ? <p className="mt-5 text-sm text-slate-500">A primeira publicação registrará também o visual que está no ar hoje.</p> : <ul className="mt-4 divide-y">{state.publications.map(item => <li key={item.id} className="py-4"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-semibold">{item.version === 0 ? 'Visual original' : 'Versão ' + item.version}</p><time className="text-xs text-slate-500" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</time></div>
      <div className="flex gap-2"><button type="button" onClick={() => void compare(item.id)} className="rounded-lg border px-3 py-2 text-sm font-medium">Comparar com o publicado</button>
      <form action={restore} onSubmit={e => { if (state.draft && !window.confirm('Substituir o rascunho salvo por esta versão? O visual publicado continuará no ar.')) e.preventDefault(); }}><input type="hidden" name="version" value={state.version} /><input type="hidden" name="publicationId" value={item.id} /><button disabled={pending} className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50">Usar como rascunho</button></form></div></div>
      {diff?.id === item.id && <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm" role="status">{diff.error ? <span className="text-red-700">{diff.error}</span> : diff.lines.length ? <><p className="font-medium">Ao voltar para esta versão, em relação ao que está no ar:</p><ul className="mt-1 list-disc pl-5">{diff.lines.map(line => <li key={line}>{line}</li>)}</ul></> : 'Idêntica ao que está publicado.'}</div>}
    </li>)}</ul>}
  </section>;
}
