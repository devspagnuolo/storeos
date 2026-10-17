'use client';
import { useActionState, useState } from 'react';
import { savePaymentRulesAction } from '../../app/admin/actions';

export type PaymentRules = { limits: { max: number; maxFree: number; minFree: number }; platformMax: number; saved: boolean };

/** Parcelamento no cartão: o lojista define aqui e o servidor aplica no checkout. */
export function PaymentRulesForm({ rules }: { rules: PaymentRules }) {
  const [state, action, pending] = useActionState(savePaymentRulesAction, {});
  // Campos controlados: depois de salvar, o formulário continua mostrando o que foi salvo.
  const [max, setMax] = useState(String(rules.limits.max));
  const [maxFree, setMaxFree] = useState(String(rules.limits.maxFree));
  const [minFree, setMinFree] = useState(rules.limits.minFree.toFixed(2).replace('.', ','));
  const options = Array.from({ length: rules.platformMax }, (_, i) => i + 1);
  return (
    <form action={action} className="card mt-6 p-6 text-sm">
      <h2 className="text-lg font-bold">Parcelamento no cartão</h2>
      <p className="mt-1 text-slate-600">Defina até quantas vezes o cliente pode parcelar e até quantas vezes sem juros. Acima disso, as parcelas aparecem com os juros do Mercado Pago.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="block min-w-0 font-medium">Máximo de parcelas
          <select name="maxInstallments" value={max} onChange={e => setMax(e.target.value)} className="input">{options.map(n => <option key={n} value={n}>{n}x</option>)}</select>
        </label>
        <label className="block min-w-0 font-medium">Sem juros até
          <select name="maxFreeInstallments" value={maxFree} onChange={e => setMaxFree(e.target.value)} className="input">{options.map(n => <option key={n} value={n}>{n === 1 ? 'Só à vista' : `${n}x`}</option>)}</select>
        </label>
        <label className="block min-w-0 font-medium">Parcela mínima sem juros (R$)
          <input name="minFreeInstallment" value={minFree} onChange={e => setMinFree(e.target.value)} inputMode="decimal" className="input" />
        </label>
      </div>
      <p className="mt-3 text-xs text-slate-500">Exemplo: sem juros até 5x com parcela mínima de R$ 100,00 e até 18x com juros. Uma compra de R$ 300,00 fica em até 3x sem juros (3 × R$ 100,00); de 4x em diante, só com juros.</p>
      {!rules.saved && !state.ok && <p className="mt-2 text-xs text-amber-800">A loja ainda usa os valores padrão do servidor. Salve para usar os seus.</p>}
      <button className="button mt-4 disabled:opacity-60" disabled={pending}>{pending ? 'Salvando…' : 'Salvar parcelamento'}</button>
      {state.error && <p role="alert" className="mt-3 text-red-700">{state.error}</p>}
      {state.ok && <p role="status" className="mt-3 text-emerald-700">{state.ok}</p>}
    </form>
  );
}
