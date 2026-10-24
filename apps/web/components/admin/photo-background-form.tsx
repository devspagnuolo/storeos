'use client';
import { useActionState, useState } from 'react';
import { savePhotoBackgroundAction } from '../../app/admin/actions';

export type PhotoBackgroundSettings = { enabled: boolean; color: string; available: boolean; sandbox: boolean };

const PRESETS = [
  ['#FFFFFF', 'Branco'],
  ['#F2F2F2', 'Cinza claro'],
  ['#F7F3EE', 'Off-white'],
  ['#E8E0D0', 'Bege'],
  ['#F6E9EC', 'Rosê'],
] as const;

/** Fundo padrão das fotos de produto: a peça é recortada e colocada sobre esta cor. A original fica guardada. */
export function PhotoBackgroundForm({ settings }: { settings: PhotoBackgroundSettings }) {
  const [state, action, pending] = useActionState(savePhotoBackgroundAction, {});
  const [color, setColor] = useState(settings.color);
  const [enabled, setEnabled] = useState(settings.enabled);
  return (
    <form action={action} className="card mt-6 p-6 text-sm">
      <h2 className="text-lg font-bold">Fundo padrão das fotos de produto</h2>
      <p className="mt-1 max-w-3xl text-slate-600">Com a opção ligada, toda foto nova de produto (enviada aqui no painel ou importada do Bling) tem o fundo trocado por esta cor. A foto original fica guardada: no produto, cada foto tem “Voltar à original”. As fotos que já estão na loja só mudam quando você usar “Fundo padrão” nela.</p>
      {!settings.available && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-800">Ainda falta a chave do Photoroom no servidor (PHOTOROOM_API_KEY). Sem ela dá para escolher a cor, mas o fundo não é trocado.</p>}
      {settings.available && settings.sandbox && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-800">Chave de teste do Photoroom: as fotos saem com marca d’água. Troque pela chave de produção antes de ligar para a loja.</p>}
      <div className="mt-4 flex flex-wrap items-end gap-6">
        <fieldset className="min-w-0">
          <legend className="font-medium">Cor do fundo</legend>
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
          <input type="hidden" name="color" value={color} />
        </fieldset>
        <div className="flex h-28 w-24 items-end justify-center rounded-lg border border-slate-200" style={{ background: color }} aria-label="Prévia da cor do fundo">
          <span className="mb-2 h-20 w-12 rounded-t-full bg-slate-700/80" />
        </div>
      </div>
      <label className="mt-4 flex items-center gap-2 font-medium">
        <input type="checkbox" name="enabled" checked={enabled} onChange={e => setEnabled(e.target.checked)} disabled={!settings.available && !settings.enabled} />
        Trocar o fundo das fotos novas automaticamente
      </label>
      <p className="mt-1 text-xs text-slate-500">Cada foto tratada consome um crédito do Photoroom. Dica: antes de ligar, abra um produto e use “Fundo padrão” em uma foto para ver como fica.</p>
      <button className="button mt-4 disabled:opacity-60" disabled={pending}>{pending ? 'Salvando…' : 'Salvar fundo'}</button>
      {state.error && <p role="alert" className="mt-3 text-red-700">{state.error}</p>}
      {state.ok && <p role="status" className="mt-3 text-emerald-700">{state.ok}</p>}
    </form>
  );
}
