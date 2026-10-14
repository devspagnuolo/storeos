'use client';
import { useActionState } from 'react';
import { saveShippingRuleAction } from '../../app/admin/actions';
import type { ShippingRule } from '../../lib/admin/types';

export const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

export function ShippingRuleForm({ rule }: { rule?: ShippingRule }) {
  const [state, action, pending] = useActionState(saveShippingRuleAction, {});
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-6">
      {rule && <input type="hidden" name="id" value={rule.id} />}
      <label className="text-sm font-medium sm:col-span-3">Nome<input name="name" required minLength={2} maxLength={60} defaultValue={rule?.name} placeholder="Ex.: Expresso Sudeste" className="input" /></label>
      <label className="text-sm font-medium">Preço (R$)<input name="price" required inputMode="decimal" pattern="\d+([.,]\d{1,2})?" defaultValue={rule?.price} className="input" /></label>
      <label className="text-sm font-medium sm:col-span-2">Grátis a partir de (R$)<input name="freeAbove" inputMode="decimal" pattern="\d+([.,]\d{1,2})?" defaultValue={rule?.freeAbove ?? ''} placeholder="Opcional" className="input" /></label>
      <label className="text-sm font-medium">Prazo mín. (dias)<input name="minDays" type="number" min={0} max={120} required defaultValue={rule?.minDays ?? 3} className="input" /></label>
      <label className="text-sm font-medium">Prazo máx. (dias)<input name="maxDays" type="number" min={0} max={120} required defaultValue={rule?.maxDays ?? 8} className="input" /></label>
      <label className="text-sm font-medium">Ordem<input name="position" type="number" min={0} max={1000} defaultValue={rule?.position ?? 0} className="input" /></label>
      <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium sm:col-span-3"><input type="checkbox" name="active" defaultChecked={rule?.active ?? true} /> Ativa no checkout</label>
      <fieldset className="sm:col-span-6">
        <legend className="text-sm font-medium">Estados atendidos <span className="font-normal text-slate-500">(nenhum marcado = todo o Brasil)</span></legend>
        <div className="mt-2 grid grid-cols-5 gap-2 text-sm sm:grid-cols-9">
          {UFS.map(uf => <label key={uf} className="flex items-center gap-1.5"><input type="checkbox" name="states" value={uf} defaultChecked={rule?.states.includes(uf)} />{uf}</label>)}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-6">
        <button className="button disabled:opacity-60" disabled={pending}>{pending ? 'Salvando…' : rule ? 'Salvar regra' : 'Criar regra'}</button>
        {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
        {state.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      </div>
    </form>
  );
}
