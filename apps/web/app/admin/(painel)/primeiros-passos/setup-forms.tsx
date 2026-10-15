'use client';
import { useActionState } from 'react';
import { saveBusinessProfileAction, setStoreOpenAction, type FormState } from '../../actions';

const SEGMENTS: [string, string][] = [['moda', 'Moda'], ['beleza', 'Beleza'], ['casa', 'Casa e decoração'], ['eletronicos', 'Eletrônicos'], ['alimentos', 'Alimentos'], ['esporte', 'Esporte'], ['infantil', 'Infantil'], ['outros', 'Outro']];
const STAGES: [string, string][] = [['starting', 'Estou começando'], ['online', 'Já vendo online'], ['physical', 'Tenho loja física']];

export function BusinessProfileForm({ profile }: { profile: Record<string, string | undefined> }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveBusinessProfileAction, {});
  return (
    <form id="dados" action={action} className="card mt-6 grid gap-4 p-6 sm:grid-cols-2">
      <h2 className="font-semibold sm:col-span-2">Dados básicos da loja</h2>
      <label className="text-sm font-medium">Segmento<select name="segment" required defaultValue={profile.segment ?? ''} className="input"><option value="" disabled>Escolha</option>{SEGMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="text-sm font-medium">Momento do negócio<select name="stage" defaultValue={profile.stage ?? ''} className="input"><option value="">Prefiro não dizer</option>{STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="text-sm font-medium">Telefone com DDD<input name="phone" defaultValue={profile.phone} inputMode="tel" className="input" /></label>
      <label className="text-sm font-medium">Cidade<input name="city" defaultValue={profile.city} className="input" /></label>
      <label className="text-sm font-medium">CNPJ <span className="font-normal text-slate-400">(opcional)</span><input name="cnpj" defaultValue={profile.cnpj} inputMode="numeric" className="input" /></label>
      <div className="flex items-end gap-3"><button className="button disabled:opacity-60" disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</button>{state.ok && <span role="status" className="text-sm text-emerald-700">{state.ok}</span>}{state.error && <span role="alert" className="text-sm text-red-700">{state.error}</span>}</div>
    </form>
  );
}

export function LaunchCard({ open, blockers }: { open: boolean; blockers: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setStoreOpenAction, {});
  return (
    <section className={'card mt-6 p-6 ' + (open ? 'border-emerald-200' : '')} aria-label="Publicar a loja">
      <h2 className="font-semibold">{open ? 'Sua loja está no ar' : 'Revisar e publicar'}</h2>
      <p className="mt-1 text-sm text-slate-600">{open ? 'Clientes já podem ver e comprar. Se precisar pausar, volte para “em construção”.' : blockers.length ? 'Termine os itens obrigatórios abaixo para poder publicar. Enquanto isso, a loja mostra “em construção” para o público e você confere tudo na prévia.' : 'Tudo que é obrigatório para abrir está pronto. Ao publicar, a loja passa a aparecer e vender.'}</p>
      <form action={action} className="mt-4 flex items-center gap-3">
        <input type="hidden" name="open" value={open ? '0' : '1'} />
        <button className={'button disabled:opacity-60 ' + (open ? 'bg-slate-600' : '')} disabled={pending || (!open && blockers.length > 0)}>{pending ? 'Aguarde…' : open ? 'Voltar para “em construção”' : 'Publicar minha loja'}</button>
        {state.ok && <span role="status" className="text-sm text-emerald-700">{state.ok}</span>}
        {state.error && <span role="alert" className="text-sm text-red-700">{state.error}</span>}
      </form>
    </section>
  );
}
