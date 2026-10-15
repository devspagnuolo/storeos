'use client';
import { useActionState } from 'react';
import { saveLoyaltyConfigAction } from '../../app/admin/actions';
import type { LoyaltyConfig } from '../../lib/admin/types';

export function LoyaltyConfigForm({ config }: { config: LoyaltyConfig }) {
  const [state, action, pending] = useActionState(saveLoyaltyConfigAction, {});
  const tiers = [
    { name: 'silver', label: 'Prata', from: config.silverFrom, pct: config.silverPct },
    { name: 'gold', label: 'Ouro', from: config.goldFrom, pct: config.goldPct },
    { name: 'diamond', label: 'Diamante', from: config.diamondFrom, pct: config.diamondPct },
  ];
  return (
    <form action={action} className="grid gap-4 text-sm sm:grid-cols-3">
      <label className="flex items-center gap-2 font-medium sm:col-span-3"><input type="checkbox" name="enabled" defaultChecked={config.enabled} /> Programa de pontos ligado<span className="font-normal text-slate-500">(desligado, os clientes param de ganhar pontos; o saldo que já têm continua).</span></label>
      <label className="font-medium">Pontos ganhos a cada R$ 1<input name="pointsPerReal" inputMode="decimal" defaultValue={config.pointsPerReal} className="input" /><span className="mt-1 block text-xs font-normal text-slate-500">Conta só os produtos, já com desconto, sem o frete.</span></label>
      <label className="font-medium">Valor de 1 ponto em cupom (R$)<input name="realPerPoint" inputMode="decimal" defaultValue={config.realPerPoint} className="input" /><span className="mt-1 block text-xs font-normal text-slate-500">0,05 devolve 5% do que o cliente gastou.</span></label>
      <label className="font-medium">Resgate mínimo (pontos)<input name="minRedeem" inputMode="numeric" defaultValue={config.minRedeem} className="input" /></label>
      <div className="sm:col-span-3"><h3 className="font-bold">Níveis</h3><p className="text-xs text-slate-500">O nível sobe pelo total de pontos já ganhos. O bônus multiplica os pontos de cada compra (100 = sem bônus, 150 = 1,5 vez). Bronze é o nível inicial.</p></div>
      {tiers.map(tier => (
        <fieldset key={tier.name} className="rounded-xl border p-3">
          <legend className="px-1 font-semibold">{tier.label}</legend>
          <label className="block font-medium">A partir de (pontos)<input name={`${tier.name}From`} inputMode="numeric" defaultValue={tier.from} className="input" /></label>
          <label className="mt-2 block font-medium">Bônus (%)<input name={`${tier.name}Pct`} inputMode="numeric" defaultValue={tier.pct} className="input" /></label>
        </fieldset>))}
      <div className="sm:col-span-3">
        {state.error && <p role="alert" className="mb-3 text-red-700">{state.error}</p>}
        {state.ok && <p role="status" className="mb-3 text-emerald-700">{state.ok}</p>}
        <button className="button disabled:opacity-60" disabled={pending}>{pending ? 'Salvando…' : 'Salvar regras'}</button>
      </div>
    </form>
  );
}
