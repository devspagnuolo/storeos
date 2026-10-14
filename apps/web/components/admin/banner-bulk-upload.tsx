'use client';
import { useActionState } from 'react';
import { bulkBannersAction } from '../../app/admin/actions';
import { ImageUploader } from './image-uploader';

/** Escolhe várias imagens do computador de uma vez; cada uma vira um slide do carrossel. */
export function BannerBulkUpload() {
  const [state, action, pending] = useActionState(bulkBannersAction, {});
  return (
    <form action={action} className="space-y-3">
      <ImageUploader name="bulkImages" kind="banner" multiple label="Várias imagens de uma vez (até 12)" />
      <div className="flex items-center gap-3">
        <button className="button disabled:opacity-60" disabled={pending}>{pending ? 'Adicionando…' : 'Adicionar ao carrossel'}</button>
        {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
        {state.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      </div>
    </form>
  );
}
