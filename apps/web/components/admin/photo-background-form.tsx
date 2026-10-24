'use client';
import { useActionState, useEffect, useState } from 'react';
import { savePhotoBackgroundAction } from '../../app/admin/actions';
import { ImageUploader } from './image-uploader';

export type PhotoBackgroundSettings = { enabled: boolean; color: string; style: 'flat' | 'studio' | 'image'; imageUrl: string | null; shadow: boolean; floor: number; available: boolean; sandbox: boolean };

const PRESETS = [
  ['#FFFFFF', 'Branco'],
  ['#F2F2F2', 'Cinza claro'],
  ['#F7F3EE', 'Off-white'],
  ['#E8E0D0', 'Bege'],
  ['#F6E9EC', 'Rosê'],
] as const;

const STYLES = [
  ['studio', 'Estúdio', 'Luz suave e chão na cor escolhida'],
  ['image', 'Minha imagem', 'Um cenário seu (parede, provador, pedestal)'],
  ['flat', 'Liso', 'Só a cor, sem luz nem chão'],
] as const;

/** Fundo padrão das fotos de produto: a peça é recortada e colocada sobre o fundo escolhido. A original fica guardada. */
export function PhotoBackgroundForm({ settings }: { settings: PhotoBackgroundSettings }) {
  const [state, action, pending] = useActionState(savePhotoBackgroundAction, {});
  const [color, setColor] = useState(settings.color);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [style, setStyle] = useState(settings.style);
  const [imageUrl, setImageUrl] = useState(settings.imageUrl ?? '');
  const [shadow, setShadow] = useState(settings.shadow);
  const [floor, setFloor] = useState(Math.round(settings.floor * 100));
  // A prévia espera o lojista parar de mexer para não pedir uma imagem a cada passo do controle.
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ style, color, shadow: String(shadow), floor: String(floor / 100), ...(imageUrl && { imageUrl }) });
      setPreview(`/admin/midia/fundo/previa?${params}`);
    }, 400);
    return () => clearTimeout(timer);
  }, [style, color, shadow, floor, imageUrl]);

  return (
    <form action={action} className="card mt-6 p-6 text-sm">
      <h2 className="text-lg font-bold">Fundo padrão das fotos de produto</h2>
      <p className="mt-1 max-w-3xl text-slate-600">Com a opção ligada, toda foto nova de produto (enviada aqui no painel ou importada do Bling) tem o fundo trocado. A foto original fica guardada: no produto, cada foto tem “Voltar à original”. As fotos que já estão na loja só mudam quando você usar “Fundo padrão” nela.</p>
      {!settings.available && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-800">Ainda falta a chave do Photoroom no servidor (PHOTOROOM_API_KEY). Sem ela dá para escolher o fundo e ver a prévia, mas as fotos não são trocadas.</p>}
      {settings.available && settings.sandbox && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-800">Chave de teste do Photoroom: as fotos saem com marca d’água. Troque pela chave de produção antes de ligar para a loja.</p>}
      <div className="mt-4 grid gap-6 md:grid-cols-[1fr_auto]">
        <div className="min-w-0 space-y-4">
          <fieldset>
            <legend className="font-medium">Estilo</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {STYLES.map(([value, label, hint]) => (
                <label key={value} className={'cursor-pointer rounded-lg border p-3 ' + (style === value ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-300')}>
                  <input type="radio" name="style" value={value} checked={style === value} onChange={() => setStyle(value)} className="sr-only" />
                  <span className="block font-medium">{label}</span>
                  <span className="mt-1 block text-xs text-slate-500">{hint}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {style === 'image' && (
            <div className="space-y-3">
              <ImageUploader kind="other" label="Imagem de fundo" initial={settings.imageUrl ? [settings.imageUrl] : []} onUploaded={urls => setImageUrl(urls[0] ?? '')} />
              <label className="block font-medium">Altura do chão na imagem: {floor}%
                <input type="range" min={60} max={98} value={floor} onChange={e => setFloor(Number(e.target.value))} className="mt-1 block w-full" />
                <span className="text-xs font-normal text-slate-500">Onde ficam os pés da modelo nas fotos de corpo inteiro. Ajuste olhando a prévia até ela pisar no lugar certo (ex.: no pedestal).</span>
              </label>
            </div>
          )}
          <fieldset>
            <legend className="font-medium">{style === 'image' ? 'Cor de apoio (bordas, se a imagem não cobrir tudo)' : 'Cor do fundo'}</legend>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {PRESETS.map(([value, label]) => (
                <button key={value} type="button" onClick={() => setColor(value)} aria-pressed={color.toUpperCase() === value} className={'flex items-center gap-2 rounded-lg border px-2 py-1 ' + (color.toUpperCase() === value ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-300')}>
                  <span className="h-5 w-5 rounded border border-slate-300" style={{ background: value }} />{label}
                </button>
              ))}
              <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-2 py-1">Outra
                <input type="color" value={color} onChange={e => setColor(e.target.value.toUpperCase())} className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0" />
              </label>
            </div>
          </fieldset>
          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" checked={shadow} onChange={e => setShadow(e.target.checked)} />
            Sombra suave embaixo e atrás da peça
          </label>
        </div>
        <figure className="mx-auto w-48">
          {preview && <img src={preview} alt="Prévia do fundo com uma silhueta de exemplo" className="aspect-[4/5] w-full rounded-lg border border-slate-200 bg-slate-50 object-cover" />}
          <figcaption className="mt-1 text-center text-xs text-slate-500">Prévia com silhueta de exemplo</figcaption>
        </figure>
      </div>
      <input type="hidden" name="color" value={color} />
      <input type="hidden" name="imageUrl" value={imageUrl} />
      <input type="hidden" name="shadow" value={String(shadow)} />
      <input type="hidden" name="floor" value={String(floor / 100)} />
      <label className="mt-5 flex items-center gap-2 font-medium">
        <input type="checkbox" name="enabled" checked={enabled} onChange={e => setEnabled(e.target.checked)} disabled={!settings.available && !settings.enabled} />
        Trocar o fundo das fotos novas automaticamente
      </label>
      <p className="mt-1 text-xs text-slate-500">Cada foto tratada consome um crédito do Photoroom. Dica: antes de ligar, abra um produto e use “Fundo padrão” em uma foto para ver como fica de verdade.</p>
      <button className="button mt-4 disabled:opacity-60" disabled={pending}>{pending ? 'Salvando…' : 'Salvar fundo'}</button>
      {state.error && <p role="alert" className="mt-3 text-red-700">{state.error}</p>}
      {state.ok && <p role="status" className="mt-3 text-emerald-700">{state.ok}</p>}
    </form>
  );
}
