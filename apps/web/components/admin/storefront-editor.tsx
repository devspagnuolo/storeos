'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { restoreStorefrontAction, saveStorefrontAction, type FormState } from '../../app/admin/actions';
import type { StorefrontConfig } from '../../lib/api';
import type { StorefrontState } from '../../lib/admin/storefront';

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="text-sm text-red-700">{state.error}</p>;
  if (state.ok) return <p role="status" className="text-sm text-emerald-700">{state.ok}</p>;
  return null;
}

export function StorefrontEditor({ config, version }: { config: StorefrontConfig; version: number }) {
  const [state, action, pending] = useActionState(saveStorefrontAction, {});
  const [imageUrl, setImageUrl] = useState(config.heroImageUrl ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState('');
  const [mobile, setMobile] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!file) { setFilePreview(''); return; }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const [announcement, setAnnouncement] = useState(config.announcementText ?? '');
  const [title, setTitle] = useState(config.heroTitle ?? 'Sua marca merece uma experiência memorável.');
  const [description, setDescription] = useState(config.heroDescription ?? 'Produtos extraordinários, entrega confiável e uma jornada simples do primeiro clique ao pós-venda.');
  const [cta, setCta] = useState(config.heroCta ?? 'Explorar coleção');
  const [accent, setAccent] = useState(config.accentColor ?? '#5B3DF5');
  const imagePreview = filePreview || imageUrl;
  return <form action={action} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
    <input type="hidden" name="version" value={version} />
    <fieldset disabled={pending} className="grid min-w-0 content-start gap-6 disabled:opacity-70">
      <section className="card grid gap-4 p-6">
        <div><h2 className="text-lg font-bold">Faixa de aviso</h2><p className="mt-1 text-sm text-slate-500">Uma mensagem curta no topo da loja. Deixe em branco para ocultar.</p></div>
        <label className="text-sm font-medium">Mensagem<input name="announcementText" maxLength={100} value={announcement} onChange={e => setAnnouncement(e.currentTarget.value)} placeholder="Frete grátis acima de R$ 299" className="input" /></label>
      </section>
      <section className="card grid gap-4 p-6">
        <h2 className="text-lg font-bold">Banner principal</h2>
        <label className="text-sm font-medium">Título<input name="heroTitle" required minLength={2} maxLength={120} value={title} onChange={e => setTitle(e.currentTarget.value)} className="input" /></label>
        <label className="text-sm font-medium">Texto de apoio<textarea name="heroDescription" maxLength={300} rows={3} value={description} onChange={e => setDescription(e.currentTarget.value)} className="input" /></label>
        <label className="text-sm font-medium">Texto do botão<input name="heroCta" maxLength={40} value={cta} onChange={e => setCta(e.currentTarget.value)} className="input" /></label>
        <label className="text-sm font-medium">Imagem do banner<input ref={fileInput} name="heroImage" type="file" accept="image/png,image/jpeg,image/webp" className="input" onChange={e => setFile(e.currentTarget.files?.[0] ?? null)} /><span className="mt-1 block text-xs font-normal text-slate-500">PNG, JPG ou WebP, até 5 MB.</span></label>
        <label className="text-sm font-medium">Ou use uma imagem por URL<input name="heroImageUrl" type="url" disabled={Boolean(file)} value={imageUrl} placeholder="https://..." className="input disabled:bg-slate-100" onChange={e => setImageUrl(e.currentTarget.value)} /></label>
        <button type="button" className="justify-self-start text-sm font-medium text-slate-500 underline" onClick={() => { setFile(null); setImageUrl(''); if (fileInput.current) fileInput.current.value = ''; }}>Remover imagem do rascunho</button>
      </section>
      <section className="card grid gap-5 p-6">
        <label className="flex items-center gap-3 text-sm font-medium">Cor de destaque<input aria-label="Cor de destaque" name="accentColor" type="color" value={accent} onChange={e => setAccent(e.currentTarget.value)} className="h-11 w-16 rounded-lg border border-slate-200 bg-surface p-1" /></label>
        <div className="flex flex-wrap gap-3">
          <button name="intent" value="draft" className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold hover:bg-slate-50">{pending ? 'Salvando…' : 'Salvar rascunho'}</button>
          <button name="intent" value="publish" className="button" onClick={e => { if (!window.confirm('Publicar este visual para todos os clientes? A versão anterior ficará no histórico.')) e.preventDefault(); }}>Publicar alterações</button>
        </div>
        <Feedback state={state} />
      </section>
    </fieldset>
    <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-semibold text-slate-500">Prévia do banner</h2><div role="group" aria-label="Tamanho da prévia" className="flex rounded-lg border bg-surface p-1"><button type="button" aria-pressed={!mobile} className={'rounded px-3 py-1 text-xs ' + (!mobile ? 'bg-violet-50 text-brand' : '')} onClick={() => setMobile(false)}>Computador</button><button type="button" aria-pressed={mobile} className={'rounded px-3 py-1 text-xs ' + (mobile ? 'bg-violet-50 text-brand' : '')} onClick={() => setMobile(true)}>Celular</button></div></div>
      <div className={'mx-auto overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-sm ' + (mobile ? 'max-w-[375px]' : '')}>
        {announcement && <div className="break-words px-4 py-2 text-center text-xs font-medium text-white" style={{ backgroundColor: accent }}>{announcement}</div>}
        <div className={'grid min-h-[390px] items-center gap-6 p-6 ' + (mobile ? 'grid-cols-1' : 'grid-cols-2')}>
          <div className="min-w-0 break-words"><p className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: accent }}>Sua loja</p><h3 className="text-2xl font-black leading-tight text-white">{title}</h3><p className="mt-4 text-sm text-slate-300">{description}</p><span className="mt-6 inline-flex rounded-xl px-4 py-2.5 text-sm font-semibold text-white" style={{ backgroundColor: accent }}>{cta}</span></div>
          <div className="aspect-[4/3] overflow-hidden rounded-2xl p-2" style={{ backgroundColor: accent }}>{imagePreview ? <img src={imagePreview} alt="Prévia do banner" className="h-full w-full rounded-xl object-cover" /> : <div className="flex h-full items-center justify-center rounded-xl bg-surface/10 p-4 text-center text-xs text-white">Escolha uma imagem</div>}</div>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">Prévia do conteúdo principal. Salvar rascunho mantém a loja publicada como está.</p>
    </aside>
  </form>;
}

export function StorefrontHistory({ state }: { state: StorefrontState }) {
  const [feedback, restore, pending] = useActionState(restoreStorefrontAction, {});
  return <section className="card mt-8 p-6"><h2 className="text-lg font-bold">Histórico de publicações</h2><p className="mt-1 text-sm text-slate-500">Recupere uma versão como rascunho para revisar antes de publicar. Exibindo as últimas 20 versões.</p><Feedback state={feedback} />
    {state.publications.length === 0 ? <p className="mt-5 text-sm text-slate-500">A primeira publicação registrará também o visual que está no ar hoje.</p> : <ul className="mt-4 divide-y">{state.publications.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><p className="text-sm font-semibold">{item.version === 0 ? 'Visual original' : 'Versão ' + item.version}</p><time className="text-xs text-slate-500" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</time></div><form action={restore} onSubmit={e => { if (state.draft && !window.confirm('Substituir o rascunho salvo por esta versão? O visual publicado continuará no ar.')) e.preventDefault(); }}><input type="hidden" name="version" value={state.version} /><input type="hidden" name="publicationId" value={item.id} /><button disabled={pending} className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50">Usar como rascunho</button></form></li>)}</ul>}
  </section>;
}
