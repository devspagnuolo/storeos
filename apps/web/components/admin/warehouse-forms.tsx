'use client';
import { useActionState } from 'react';
import { adjustWarehouseAction, createWarehouseAction, deleteWarehouseAction, transferStockAction } from '../../app/admin/actions';
import type { WarehouseRow } from '../../lib/admin/types';

type Option = { value: string; label: string };
function Message({ state }: { state: { error?: string; ok?: string } }) {
  return <>{state.error && <p role="alert" className="text-sm text-red-700 md:col-span-6">{state.error}</p>}{state.ok && <p className="text-sm text-emerald-700 md:col-span-6">{state.ok}</p>}</>;
}

export function NewWarehouseForm() {
  const [state, action, pending] = useActionState(createWarehouseAction, {});
  return (
    <form action={action} className="card mt-4 grid gap-3 p-4 md:grid-cols-6 md:items-end">
      <label className="text-sm font-medium md:col-span-4">Novo depósito ou loja física<input name="name" required minLength={2} maxLength={60} className="input" placeholder="ex.: Loja Centro, Estoque Pernambuco" /></label>
      <button className="button md:col-span-2 disabled:opacity-60" disabled={pending}>Criar depósito</button>
      <Message state={state} />
    </form>
  );
}

export function TransferForm({ options, warehouses }: { options: Option[]; warehouses: WarehouseRow[] }) {
  const [state, action, pending] = useActionState(transferStockAction, {});
  const active = warehouses.filter(w => w.active);
  return (
    <form action={action} className="card mt-4 grid gap-3 p-4 md:grid-cols-6 md:items-end">
      <h2 className="font-bold md:col-span-6">Transferir entre depósitos</h2>
      <label className="text-sm font-medium md:col-span-2">Produto<select name="item" required className="input">{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      <label className="text-sm font-medium">De<select name="fromId" className="input">{active.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
      <label className="text-sm font-medium">Para<select name="toId" className="input" defaultValue={active[1]?.id}>{active.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
      <label className="text-sm font-medium">Quantidade<input name="quantity" type="number" min={1} step={1} required className="input" /></label>
      <button className="button disabled:opacity-60" disabled={pending}>Transferir</button>
      <Message state={state} />
    </form>
  );
}

export function WarehouseAdjustForm({ options, warehouses }: { options: Option[]; warehouses: WarehouseRow[] }) {
  const [state, action, pending] = useActionState(adjustWarehouseAction, {});
  return (
    <form action={action} className="card mt-4 grid gap-3 p-4 md:grid-cols-6 md:items-end">
      <h2 className="font-bold md:col-span-6">Entrada ou ajuste num depósito</h2>
      <label className="text-sm font-medium md:col-span-2">Produto<select name="item" required className="input">{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      <label className="text-sm font-medium">Depósito<select name="warehouseId" className="input">{warehouses.filter(w => w.active).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
      <label className="text-sm font-medium">Tipo<select name="mode" className="input"><option value="DELTA">Somar / subtrair</option><option value="SET">Definir saldo</option></select></label>
      <label className="text-sm font-medium">Quantidade<input name="quantity" type="number" step={1} required className="input" /></label>
      <label className="text-sm font-medium">Motivo<input name="reason" required minLength={3} maxLength={200} className="input" /></label>
      <Message state={state} />
      <button className="button disabled:opacity-60 md:col-span-6 md:w-40" disabled={pending}>Aplicar</button>
    </form>
  );
}

export function DeleteWarehouse({ id }: { id: string }) {
  const [state, action, pending] = useActionState(deleteWarehouseAction, {});
  return (
    <form action={action} onSubmit={e => { if (!confirm('Excluir este depósito?')) e.preventDefault(); }} className="inline">
      <input type="hidden" name="id" value={id} />
      <button className="text-xs text-red-700 underline disabled:opacity-60" disabled={pending}>Excluir</button>
      {state.error && <span role="alert" className="ml-2 text-xs text-red-700">{state.error}</span>}
    </form>
  );
}
