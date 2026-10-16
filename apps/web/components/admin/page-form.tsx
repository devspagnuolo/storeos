'use client';
import { useActionState } from 'react';
import { savePageAction } from '../../app/admin/actions';
import type { AdminPage } from '../../lib/admin/types';
import { ImageUploader } from './image-uploader';
import { RichTextEditor } from './rich-text-editor';

/** Formulário de página institucional ou, com `kind="POST"`, de artigo do blog (capa, resumo e autor). */
export function PageForm({ page, kind = page?.kind ?? 'PAGE' }: { page?: AdminPage; kind?: 'PAGE' | 'POST' }) {
  const [state, action, pending] = useActionState(savePageAction, {});
  const post = kind === 'POST';
  const base = post ? '/blog/' : '/p/';
  return (
    // Depois de criar, o formulário de nova página volta em branco (a página criada aparece na lista).
    <form key={page ? page.id : state.ok} action={action} className="grid gap-3">
      {page && <input type="hidden" name="id" value={page.id} />}
      <input type="hidden" name="kind" value={kind} />
      <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
        <label className="text-sm font-medium">Título<input name="title" required minLength={2} maxLength={120} defaultValue={page?.title} className="input" /></label>
        {page ? <p className="text-sm font-medium">Endereço<span className="mt-1 block py-2 font-mono text-sm font-normal text-slate-500">{base}{page.slug}</span></p> : <label className="text-sm font-medium">Endereço (opcional) <span className="font-normal text-slate-400">{base}…</span><input name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" className="input font-mono text-sm" placeholder="gerado a partir do título" /></label>}
      </div>
      {post && <>
        <label className="text-sm font-medium">Resumo <span className="font-normal text-slate-400">(aparece na lista do blog)</span><textarea name="excerpt" maxLength={300} rows={2} defaultValue={page?.excerpt ?? ''} className="input" /></label>
        <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          <div className="text-sm font-medium">Imagem de capa<div className="mt-1 font-normal"><ImageUploader name="coverImageUrl" kind="other" initial={page?.coverImageUrl ? [page.coverImageUrl] : []} label="Enviar capa (16:9)" /></div></div>
          <label className="text-sm font-medium">Autor<input name="authorName" maxLength={80} defaultValue={page?.authorName ?? ''} className="input" placeholder="Ex.: Equipe Vivi" /></label>
        </div>
      </>}
      <div className="text-sm font-medium">Conteúdo<div className="mt-1 font-normal"><RichTextEditor name="body" defaultValue={page?.body} /></div></div>
      <label className="text-sm font-medium">Descrição para o Google<input name="seoDescription" maxLength={160} defaultValue={page?.seoDescription ?? ''} className="input" /></label>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" defaultChecked={page?.published} /> {post ? 'Publicado' : 'Publicada'}</label>
        {!post && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showInFooter" defaultChecked={page?.showInFooter ?? true} /> Mostrar no rodapé da loja</label>}
      </div>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      <div className="flex flex-wrap items-center gap-4">
        <button className="button disabled:opacity-60" disabled={pending}>{pending ? 'Salvando…' : page ? 'Salvar' : post ? 'Criar artigo' : 'Criar página'}</button>
        {page?.published && <a href={`${base}${page.slug}`} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand underline">Ver na loja ↗</a>}
      </div>
    </form>
  );
}
