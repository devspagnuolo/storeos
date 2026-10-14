'use client';
import { useActionState } from 'react';
import { saveBannerAction } from '../../app/admin/actions';
import type { AdminBanner } from '../../lib/admin/types';
import { ImageUploader } from './image-uploader';

const local = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');

export function BannerForm({ banner }: { banner?: AdminBanner }) {
  const [state, action, pending] = useActionState(saveBannerAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      {banner && <input type="hidden" name="id" value={banner.id} />}
      <div className="sm:col-span-2"><ImageUploader name="imageUrl" kind="banner" label="Imagem do banner" initial={banner ? [banner.imageUrl] : []} /></div>
      <div className="sm:col-span-2"><ImageUploader name="mobileImageUrl" kind="banner-mobile" label="Imagem para celular (opcional)" initial={banner?.mobileImageUrl ? [banner.mobileImageUrl] : []} /></div>
      <label className="text-sm font-medium">Título (opcional)<input name="title" maxLength={80} defaultValue={banner?.title ?? ''} className="input" /></label>
      <label className="text-sm font-medium">Subtítulo (opcional)<input name="subtitle" maxLength={160} defaultValue={banner?.subtitle ?? ''} className="input" /></label>
      <label className="text-sm font-medium">Texto do botão (opcional)<input name="ctaLabel" maxLength={30} defaultValue={banner?.ctaLabel ?? ''} className="input" placeholder="Ver coleção" /></label>
      <label className="text-sm font-medium">Link ao clicar<input name="linkUrl" defaultValue={banner?.linkUrl ?? ''} className="input" placeholder="/categorias/vestidos ou https://…" /></label>
      <label className="text-sm font-medium">Começa em (opcional)<input name="startsAt" type="datetime-local" defaultValue={local(banner?.startsAt ?? null)} className="input" /></label>
      <label className="text-sm font-medium">Termina em (opcional)<input name="endsAt" type="datetime-local" defaultValue={local(banner?.endsAt ?? null)} className="input" /></label>
      {banner && <label className="text-sm font-medium">Ordem<input name="position" type="number" min={0} max={1000} defaultValue={banner.position} className="input" /></label>}
      <div className="flex items-end gap-3 sm:col-span-2">
        <button className="button disabled:opacity-60" disabled={pending}>{banner ? 'Salvar banner' : 'Adicionar banner'}</button>
        {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
        {state.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      </div>
    </form>
  );
}
