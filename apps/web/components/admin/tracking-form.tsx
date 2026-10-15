'use client';
import { useActionState } from 'react';
import { saveTrackingAction } from '../../app/admin/actions';
import type { TrackingConfig } from '../../lib/admin/types';

export function TrackingForm({ config }: { config: TrackingConfig }) {
  const [state, action, pending] = useActionState(saveTrackingAction, {});
  return (
    <form action={action} className="grid gap-4 text-sm sm:grid-cols-2">
      <label className="font-medium sm:col-span-2">Título da página inicial no Google<input name="homeTitle" maxLength={70} defaultValue={config.homeTitle} className="input" placeholder="Vivi Moda Plus Size | Roupas até o tamanho 60" /><span className="mt-1 block text-xs font-normal text-slate-500">Até 70 letras. É o título azul que aparece quando alguém busca o nome da loja.</span></label>
      <label className="font-medium sm:col-span-2">Descrição da página inicial no Google<textarea name="homeDescription" maxLength={200} rows={2} defaultValue={config.homeDescription} className="input" placeholder="Moda plus size feminina com entrega para todo o Brasil. Parcele em até 12x." /><span className="mt-1 block text-xs font-normal text-slate-500">Até 200 letras. É o texto cinza abaixo do título.</span></label>
      <label className="font-medium">Google Analytics (ID)<input name="ga4" defaultValue={config.ga4} className="input uppercase" placeholder="G-ABC123DEF4" /></label>
      <label className="font-medium">Google Tag Manager (ID)<input name="gtm" defaultValue={config.gtm} className="input uppercase" placeholder="GTM-ABC1234" /><span className="mt-1 block text-xs font-normal text-slate-500">Se usar o Tag Manager, não precisa do Analytics acima (evita contar em dobro).</span></label>
      <label className="font-medium">Pixel do Meta, Instagram e Facebook (ID)<input name="metaPixel" inputMode="numeric" defaultValue={config.metaPixel} className="input" placeholder="123456789012345" /></label>
      <label className="font-medium">Google Search Console (código de verificação)<input name="googleVerification" defaultValue={config.googleVerification} className="input" placeholder="Só o código do campo content" /></label>
      <div className="sm:col-span-2">
        {state.error && <p role="alert" className="mb-3 text-red-700">{state.error}</p>}
        {state.ok && <p role="status" className="mb-3 text-emerald-700">{state.ok}</p>}
        <button className="button disabled:opacity-60" disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </form>
  );
}
