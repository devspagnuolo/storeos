'use client';
import { useActionState } from 'react';
import { savePageAction } from '../../app/admin/actions';
import type { AdminPage } from '../../lib/admin/types';

export function PageForm({ page }: { page?: AdminPage }) {
  const [state, action, pending] = useActionState(savePageAction, {});
  return (
    <form action={action} className="grid gap-3">
      {page && <input type="hidden" name="id" value={page.id} />}
      <label className="text-sm font-medium">Título<input name="title" required minLength={2} maxLength={120} defaultValue={page?.title} className="input" /></label>
      {!page && <label className="text-sm font-medium">Endereço (opcional) <span className="font-normal text-slate-400">/p/…</span><input name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" className="input font-mono text-sm" placeholder="gerado a partir do título" /></label>}
      <label className="text-sm font-medium">Conteúdo <span className="font-normal text-slate-400">(use &quot;## &quot; para títulos e &quot;- &quot; para listas; separe parágrafos com linha em branco)</span><textarea name="body" required rows={10} maxLength={20000} defaultValue={page?.body} className="input" /></label>
      <label className="text-sm font-medium">Descrição para o Google<input name="seoDescription" maxLength={160} defaultValue={page?.seoDescription ?? ''} className="input" /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" defaultChecked={page?.published} /> Publicada</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showInFooter" defaultChecked={page?.showInFooter ?? true} /> Mostrar no rodapé da loja</label>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      <button className="button disabled:opacity-60" disabled={pending}>{page ? 'Salvar' : 'Criar página'}</button>
    </form>
  );
}
