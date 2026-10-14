'use client';
import { useActionState } from 'react';
import { loyaltyAction } from '../../app/admin/actions';
import { formatDateTime } from '../../lib/admin/labels';
import type { LoyaltySummary } from '../../lib/admin/types';

const typeLabel = { EARN: 'Compra', REVERSAL: 'Estorno', REDEEM: 'Resgate', ADJUST: 'Ajuste' };

export function LoyaltyPanel({ customerId, loyalty, canEdit }: { customerId: string; loyalty: LoyaltySummary; canEdit: boolean }) {
  const [state, action, pending] = useActionState(loyaltyAction, {});
  const { tier } = loyalty;
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between"><h2 className="font-bold">Fidelidade</h2><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">{tier.label}</span></div>
      <p className="mt-3 text-3xl font-black">{loyalty.balance} <span className="text-sm font-normal text-slate-500">pontos (≈ R$ {(loyalty.balance * loyalty.valuePerPoint).toFixed(2).replace('.', ',')})</span></p>
      {tier.next && <p className="mt-1 text-xs text-slate-500">Faltam {tier.next.missing} pontos ganhos para o nível {tier.next.label}.</p>}
      {canEdit && (
        <form action={action} className="mt-4 space-y-3 border-t pt-4">
          <input type="hidden" name="id" value={customerId} />
          <label className="block text-sm font-medium">Pontos<input name="points" inputMode="numeric" required className="input" placeholder="Ex.: 100 (ajuste pode ser negativo)" /></label>
          <label className="block text-sm font-medium">Motivo do ajuste<input name="note" maxLength={200} className="input" /></label>
          <div className="flex flex-wrap gap-2">
            <button name="kind" value="adjust" className="button-ghost disabled:opacity-60" disabled={pending}>Ajustar saldo</button>
            <button name="kind" value="redeem" className="button disabled:opacity-60" disabled={pending}>Resgatar em cupom</button>
          </div>
          {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
          {state.ok && <p className="text-sm text-emerald-700">{state.ok}{state.code && <> Código: <b className="font-mono">{state.code}</b></>}</p>}
        </form>
      )}
      <ul className="mt-4 divide-y border-t text-sm">{loyalty.entries.map(e => <li key={e.id} className="flex justify-between py-2"><span>{typeLabel[e.type]}<span className="block text-xs text-slate-400">{e.note} · {formatDateTime(e.createdAt)}</span></span><b className={e.points < 0 ? 'text-red-700' : 'text-emerald-700'}>{e.points > 0 ? '+' : ''}{e.points}</b></li>)}</ul>
    </section>
  );
}
