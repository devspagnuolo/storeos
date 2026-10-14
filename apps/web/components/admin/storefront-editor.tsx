'use client';
import { useActionState, useState } from 'react';
import { saveStorefrontAction, type FormState } from '../../app/admin/actions';

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="text-sm text-red-700">{state.error}</p>;
  if (state.ok) return <p role="status" className="text-sm text-emerald-700">{state.ok}</p>;
  return null;
}

export type StorefrontEditorConfig = {
  announcementText?: string;
  heroTitle?: string;
  heroDescription?: string;
  heroCta?: string;
  heroImageUrl?: string | null;
  accentColor?: string;
};

export function StorefrontEditor({ config }: { config: StorefrontEditorConfig }) {
  const [state, action, pending] = useActionState(saveStorefrontAction, {});
  const [imagePreview, setImagePreview] = useState(config.heroImageUrl ?? '');
  const [announcement, setAnnouncement] = useState(config.announcementText ?? '');
  const [title, setTitle] = useState(config.heroTitle ?? 'Sua marca merece uma experiência memorável.');
  const [description, setDescription] = useState(config.heroDescription ?? 'Produtos extraordinários, entrega confiável e uma jornada simples do primeiro clique ao pós-venda.');
  const [cta, setCta] = useState(config.heroCta ?? 'Explorar coleção');
  const [accent, setAccent] = useState(config.accentColor ?? '#5B3DF5');
  return (
    <form action={action} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
      <div className="grid content-start gap-6">
        <section className="card grid gap-4 p-6">
          <div><h2 className="text-lg font-bold">Faixa de aviso</h2><p className="mt-1 text-sm text-slate-500">Uma mensagem curta no topo da loja. Deixe em branco para ocultar.</p></div>
          <label className="text-sm font-medium">Mensagem<input name="announcementText" maxLength={100} value={announcement} onChange={event => setAnnouncement(event.currentTarget.value)} placeholder="Frete grátis acima de R$ 299" className="input" /></label>
        </section>
        <section className="card grid gap-4 p-6">
          <div><h2 className="text-lg font-bold">Banner principal</h2><p className="mt-1 text-sm text-slate-500">Apresente a coleção ou a mensagem mais importante da sua loja.</p></div>
          <label className="text-sm font-medium">Título<input name="heroTitle" required minLength={2} maxLength={120} value={title} onChange={event => setTitle(event.currentTarget.value)} className="input" /></label>
          <label className="text-sm font-medium">Texto de apoio<textarea name="heroDescription" maxLength={300} rows={3} value={description} onChange={event => setDescription(event.currentTarget.value)} className="input" /></label>
          <label className="text-sm font-medium">Texto do botão<input name="heroCta" maxLength={40} value={cta} onChange={event => setCta(event.currentTarget.value)} className="input" /></label>
          <label className="text-sm font-medium">Imagem do banner<input name="heroImage" type="file" accept="image/png,image/jpeg,image/webp" className="input file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2" onChange={event => { const file = event.currentTarget.files?.[0]; if (file) setImagePreview(URL.createObjectURL(file)); }} /><span className="mt-1 block text-xs font-normal text-slate-500">PNG, JPG ou WebP, até 5 MB. A imagem é guardada no armazenamento da loja.</span></label>
          <label className="text-sm font-medium">Ou informe uma URL de imagem<input name="heroImageUrl" type="url" defaultValue={config.heroImageUrl ?? ''} placeholder="https://..." className="input" onChange={event => setImagePreview(event.currentTarget.value)} /></label>
        </section>
        <section className="card flex flex-wrap items-center justify-between gap-4 p-6">
          <label className="flex items-center gap-3 text-sm font-medium">Cor de destaque<input aria-label="Cor de destaque" name="accentColor" type="color" value={accent} onChange={event => setAccent(event.currentTarget.value)} className="h-11 w-16 cursor-pointer rounded-lg border border-slate-200 bg-white p-1" /></label>
          <div className="flex flex-wrap items-center gap-4"><button className="button disabled:opacity-60" disabled={pending}>{pending ? 'Publicando…' : 'Salvar e publicar'}</button><Feedback state={state} /></div>
        </section>
      </div>
      <aside className="xl:sticky xl:top-6 xl:self-start">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Prévia do banner</p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {announcement && <div className="px-4 py-2 text-center text-xs font-medium text-white" style={{ backgroundColor: accent }}>{announcement}</div>}
          <div className="grid min-h-[390px] items-center gap-6 p-6 sm:grid-cols-2 sm:p-8">
            <div><p className="mb-3 text-xs font-semibold uppercase tracking-[.18em]" style={{ color: accent }}>Sua loja</p><h3 className="text-2xl font-black leading-tight text-slate-900">{title}</h3><p className="mt-4 text-sm text-slate-600">{description}</p><span className="mt-6 inline-flex rounded-xl px-4 py-2.5 text-sm font-semibold text-white" style={{ backgroundColor: accent }}>{cta}</span></div>
            <div className="aspect-square overflow-hidden rounded-2xl bg-slate-100">{imagePreview ? <img src={imagePreview} alt="Prévia do banner" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-400">Sua imagem aparecerá aqui</div>}</div>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">A prévia ajuda a ajustar o conteúdo. A publicação atualiza a vitrine para todos os clientes.</p>
      </aside>
    </form>
  );
}
