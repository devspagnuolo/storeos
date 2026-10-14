'use client';
import { useActionState } from 'react';
import { adjustStockAction } from '../../app/admin/actions';

export type StockOption = { value: string; label: string };

export function StockAdjustForm({ options }: { options: StockOption[] }) {
  const [state, action, pending] = useActionState(adjustStockAction, {});
  return (
    <form action={action} className="card mt-6 grid gap-3 p-4 md:grid-cols-6 md:items-end">
      <label className="text-sm font-medium md:col-span-2">Produto
        <select name="item" required className="input">{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
      </label>
      <label className="text-sm font-medium">Tipo
        <select name="mode" className="input"><option value="DELTA">Somar / subtrair</option><option value="SET">Definir saldo</option></select>
      </label>
      <label className="text-sm font-medium">Quantidade<input name="quantity" type="number" step={1} required className="input" placeholder="ex.: 10 ou -2" /></label>
      <label className="text-sm font-medium">Motivo<input name="reason" required minLength={3} maxLength={200} className="input" placeholder="ex.: compra do fornecedor" /></label>
      <button className="button disabled:opacity-60" disabled={pending}>Aplicar</button>
      {state.error && <p role="alert" className="text-sm text-red-700 md:col-span-6">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-700 md:col-span-6">{state.ok}</p>}
    </form>
  );
}
