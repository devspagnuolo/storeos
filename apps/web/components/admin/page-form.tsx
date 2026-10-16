'use client';
import { useActionState } from 'react';
import { savePageAction } from '../../app/admin/actions';
import type { AdminPage } from '../../lib/admin/types';
import { RichTextEditor } from './rich-text-editor';

export function PageForm({ page }: { page?: AdminPage }) {
  const [state, action, pending] = useActionState(savePageAction, {});
  return (
    // Depois de criar, o formulário de nova página volta em branco (a página criada aparece na lista).
    <form key={page ? page.id : state.ok} action={action} className="grid gap-3">
      {page && <input type="hidden" name="id" value={page.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Título<input name="title" required minLength={2} maxLength={120} defaultValue={page?.title} className="input" /></label>
        {page ? <p className="text-sm font-medium">Endereço<span className="mt-1 block py-2 font-mono text-sm font-normal text-slate-500">/p/{page.slug}</span></p> : <label className="text-sm font-medium">Endereço (opcional) <span className="font-normal text-slate-400">/p/…</span><input name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" className="input font-mono text-sm" placeholder="gerado a partir do título" /></label>}
      </div>
      <div className="text-sm font-medium">Conteúdo<div className="mt-1 font-normal"><RichTextEditor name="body" defaultValue={page?.body} /></div></div>
      <label className="text-sm font-medium">Descrição para o Google<input name="seoDescription" maxLength={160} defaultValue={page?.seoDescription ?? ''} className="input" /></label>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" defaultChecked={page?.published} /> Publicada</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showInFooter" defaultChecked={page?.showInFooter ?? true} /> Mostrar no rodapé da loja</label>
      </div>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      <div className="flex flex-wrap items-center gap-4">
        <button className="button disabled:opacity-60" disabled={pending}>{pending ? 'Salvando…' : page ? 'Salvar' : 'Criar página'}</button>
        {page?.published && <a href={`/p/${page.slug}`} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand underline">Ver na loja ↗</a>}
      </div>
    </form>
  );
}
