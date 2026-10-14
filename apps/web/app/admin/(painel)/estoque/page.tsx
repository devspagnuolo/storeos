import { adminFetch } from '../../../../lib/admin/session';
import type { StockItem, StockMovementPage } from '../../../../lib/admin/types';
import { StockAdjustForm } from '../../../../components/admin/stock-adjust-form';

export const dynamic = 'force-dynamic';

const LOW = 5;
const typeLabel = { INITIAL: 'Cadastro', ADJUSTMENT: 'Ajuste', SALE: 'Venda', RETURN: 'Devolução' } as const;

export default async function StockPage() {
  const [items, movements] = await Promise.all([
    adminFetch<StockItem[]>('/inventory/items'),
    adminFetch<StockMovementPage>('/inventory/movements?pageSize=30'),
  ]);
  const name = (i: StockItem) => (i.variation ? `${i.name} (${i.variation})` : i.name);
  const low = items.filter(i => i.status === 'ACTIVE' && i.available <= LOW);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Estoque</h1>
        <a href="/painel/estoque/export" className="button">Baixar planilha (CSV)</a>
      </div>
      <p className="mt-1 text-sm text-slate-500">Saldo de cada produto e variação, com o histórico de todas as entradas e saídas. O reservado são pedidos aguardando pagamento.</p>

      {low.length > 0 && (
        <section className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <h2 className="font-semibold">Estoque baixo ({low.length})</h2>
          <ul className="mt-2 grid gap-1 md:grid-cols-2">
            {low.slice(0, 12).map(i => <li key={`${i.productId}-${i.variantId}`}>{name(i)} — <strong>{i.available}</strong> disponível</li>)}
          </ul>
        </section>
      )}

      <StockAdjustForm options={items.map(i => ({ value: `${i.productId}:${i.variantId ?? ''}`, label: `${name(i)} · ${i.sku} (${i.available} disp.)` }))} />

      <div className="card mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs uppercase text-slate-500"><tr><th className="p-3">SKU</th><th className="p-3">Produto</th><th className="p-3 text-right">Físico</th><th className="p-3 text-right">Reservado</th><th className="p-3 text-right">Disponível</th></tr></thead>
          <tbody>
            {items.map(i => (
              <tr key={`${i.productId}-${i.variantId}`} className="border-b last:border-0">
                <td className="p-3 font-mono text-xs">{i.sku}</td><td className="p-3">{name(i)}</td>
                <td className="p-3 text-right">{i.quantity}</td><td className="p-3 text-right">{i.reserved}</td>
                <td className={`p-3 text-right font-semibold ${i.available <= LOW ? 'text-amber-700' : ''}`}>{i.available}</td>
              </tr>))}
            {!items.length && <tr><td colSpan={5} className="p-8 text-center text-slate-500">Nenhum produto ainda.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-xl font-semibold">Últimas movimentações</h2>
      <div className="card mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs uppercase text-slate-500"><tr><th className="p-3">Quando</th><th className="p-3">Item</th><th className="p-3">Tipo</th><th className="p-3 text-right">Qtd.</th><th className="p-3 text-right">Saldo</th><th className="p-3">Motivo</th></tr></thead>
          <tbody>
            {movements.items.map(m => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="p-3 whitespace-nowrap">{new Date(m.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
                <td className="p-3">{m.productName} <span className="font-mono text-xs text-slate-500">{m.sku}</span></td>
                <td className="p-3">{typeLabel[m.type]}</td>
                <td className={`p-3 text-right font-semibold ${m.delta < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                <td className="p-3 text-right">{m.balance}</td>
                <td className="p-3">{m.orderNumber ? `Pedido ${m.orderNumber}` : m.reason}</td>
              </tr>))}
            {!movements.items.length && <tr><td colSpan={6} className="p-8 text-center text-slate-500">Sem movimentações ainda.</td></tr>}
          </tbody>
        </table>
      </div>
      {movements.total > movements.items.length && <p className="mt-3 text-xs text-slate-500">Mostrando as {movements.items.length} mais recentes de {movements.total}.</p>}
    </>
  );
}
