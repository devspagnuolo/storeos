import Link from 'next/link';
import { DeleteWarehouse, NewWarehouseForm, TransferForm, WarehouseAdjustForm } from '../../../../../components/admin/warehouse-forms';
import { toggleWarehouseAction } from '../../../actions';
import { formatDateTime } from '../../../../../lib/admin/labels';
import { adminFetch } from '../../../../../lib/admin/session';
import type { WarehouseMatrix, WarehouseRow, WarehouseTransferRow } from '../../../../../lib/admin/types';

export const dynamic = 'force-dynamic';

export default async function WarehousesPage() {
  const [warehouses, matrix, transfers] = await Promise.all([
    adminFetch<WarehouseRow[]>('/inventory/warehouses'),
    adminFetch<WarehouseMatrix>('/inventory/warehouses-stock'),
    adminFetch<WarehouseTransferRow[]>('/inventory/transfers'),
  ]);
  const label = (i: WarehouseMatrix['items'][number]) => (i.variation ? `${i.name} (${i.variation})` : i.name);
  const options = matrix.items.map(i => ({ value: `${i.productId}:${i.variantId ?? ''}`, label: `${label(i)} · ${i.sku}` }));
  const cols = matrix.warehouses.filter(w => w.active || matrix.items.some(i => (i.byWarehouse[w.id] ?? 0) > 0));
  return (
    <>
      <Link href="/admin/estoque" className="text-sm text-slate-500">← Estoque</Link>
      <h1 className="mt-2 text-3xl font-bold">Depósitos e lojas físicas</h1>
      <p className="mt-1 text-sm text-slate-500">Controle onde cada produto está guardado. Os pedidos da loja virtual saem do saldo total, que é a soma de todos os depósitos; o Principal guarda o que não está nos outros.</p>

      <div className="card mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs uppercase text-slate-500"><tr><th className="p-3">Depósito</th><th className="p-3 text-right">Unidades</th><th className="p-3 text-right">Itens</th><th className="p-3" /></tr></thead>
          <tbody>{warehouses.map(w => (
            <tr key={w.id} className="border-b last:border-0">
              <td className="p-3 font-medium">{w.name}{w.isDefault && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs">principal</span>}{!w.active && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">desativado</span>}</td>
              <td className="p-3 text-right font-semibold">{w.units}</td><td className="p-3 text-right">{w.isDefault ? '—' : w.skus}</td>
              <td className="p-3 text-right">{!w.isDefault && <div className="flex justify-end gap-3"><form action={toggleWarehouseAction}><input type="hidden" name="id" value={w.id} /><input type="hidden" name="active" value={String(!w.active)} /><button className="text-xs underline">{w.active ? 'Desativar' : 'Ativar'}</button></form><DeleteWarehouse id={w.id} /></div>}</td>
            </tr>))}</tbody>
        </table>
      </div>
      <NewWarehouseForm />
      {warehouses.length > 1 && <TransferForm options={options} warehouses={warehouses} />}
      <WarehouseAdjustForm options={options} warehouses={warehouses} />

      <h2 className="mt-10 text-xl font-semibold">Saldo por depósito</h2>
      <div className="card mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs uppercase text-slate-500"><tr><th className="p-3">Produto</th>{cols.map(w => <th key={w.id} className="p-3 text-right">{w.name}</th>)}<th className="p-3 text-right">Total</th></tr></thead>
          <tbody>{matrix.items.map(i => (
            <tr key={`${i.productId}-${i.variantId}`} className="border-b last:border-0">
              <td className="p-3">{label(i)} <span className="font-mono text-xs text-slate-500">{i.sku}</span></td>
              {cols.map(w => <td key={w.id} className={`p-3 text-right ${(i.byWarehouse[w.id] ?? 0) < 0 ? 'font-semibold text-red-700' : ''}`}>{i.byWarehouse[w.id] ?? 0}</td>)}
              <td className="p-3 text-right font-semibold">{i.quantity}</td>
            </tr>))}
            {!matrix.items.length && <tr><td colSpan={cols.length + 2} className="p-8 text-center text-slate-500">Nenhum produto ainda.</td></tr>}</tbody>
        </table>
      </div>

      <h2 className="mt-10 text-xl font-semibold">Últimas transferências</h2>
      <div className="card mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm"><tbody>{transfers.map(t => <tr key={t.id} className="border-b last:border-0"><td className="p-3 whitespace-nowrap text-slate-500">{formatDateTime(t.createdAt)}</td><td className="p-3">{t.fromWarehouse} → {t.toWarehouse}</td><td className="p-3 text-right font-semibold">{t.quantity} un.</td><td className="p-3 text-slate-500">{t.reason}</td></tr>)}
          {!transfers.length && <tr><td className="p-8 text-center text-slate-500">Nenhuma transferência ainda.</td></tr>}</tbody></table>
      </div>
    </>
  );
}
