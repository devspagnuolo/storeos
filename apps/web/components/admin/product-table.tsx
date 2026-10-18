'use client';
import Link from 'next/link';
import { startTransition, useActionState, useState } from 'react';
import { bulkProductsAction, type FormState } from '../../app/admin/actions';
import { productStatusLabel } from '../../lib/admin/labels';
import type { AdminProduct } from '../../lib/admin/types';
import { formatPrice } from '../../lib/format';

const tone: Record<string, string> = { ACTIVE: 'bg-emerald-100 text-emerald-800', DRAFT: 'bg-slate-100 text-slate-700', ARCHIVED: 'bg-slate-200 text-slate-600' };
type Action = 'activate' | 'deactivate' | 'delete' | 'category';
type CategoryOption = { id: string; name: string; depth: number };

/**
 * Lista gerencial de produtos: seleção em lote, ativar, inativar, excluir e trocar a categoria.
 * Excluir apaga só no site (o Bling fica igual) e só vale para quem nunca esteve em um pedido; a categoria nova vai também para o Bling.
 */
export function ProductTable({ items, categories }: { items: AdminProduct[]; categories: CategoryOption[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(bulkProductsAction, {});
  const [selected, setSelected] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const allChecked = items.length > 0 && selected.length === items.length;
  const toggle = (id: string) => setSelected(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]);

  const run = (kind: Action, ids: string[]) => {
    if (!ids.length) return;
    if (kind === 'delete') {
      const blocked = items.filter(p => ids.includes(p.id) && p.canDelete === false).length;
      const text = blocked === ids.length
        ? 'Os produtos escolhidos já tiveram pedidos e não podem ser excluídos. Use Inativar.'
        : `Excluir ${ids.length - blocked} produto(s) do site? No Bling eles continuam cadastrados.${blocked ? ` ${blocked} com pedido ficam de fora (só podem ser inativados).` : ''}`;
      if (blocked === ids.length) return window.alert(text);
      if (!window.confirm(text)) return;
    }
    const data = new FormData();
    ids.forEach(id => data.append('ids', id));
    data.set('action', kind);
    if (kind === 'category') data.set('categoryId', categoryId);
    setSelected([]);
    startTransition(() => action(data));
  };

  return (
    <div className="mt-4">
      <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-t-2xl border border-b-0 bg-slate-50 px-4 py-2 text-sm">
        {selected.length ? <>
          <span className="font-medium">{selected.length} selecionado(s)</span>
          <button type="button" disabled={pending} onClick={() => run('activate', selected)} className="rounded border bg-white px-3 py-1.5 font-medium hover:border-brand">Ativar</button>
          <button type="button" disabled={pending} onClick={() => run('deactivate', selected)} className="rounded border bg-white px-3 py-1.5 font-medium hover:border-brand">Inativar</button>
          <button type="button" disabled={pending} onClick={() => run('delete', selected)} className="rounded border border-red-200 bg-white px-3 py-1.5 font-medium text-red-700 hover:border-red-400">Excluir do site</button>
          <span className="flex min-w-0 max-w-full items-center gap-2">
            <select value={categoryId} onChange={event => setCategoryId(event.target.value)} aria-label="Nova categoria" className="input !mt-0 min-w-0 max-w-[14rem] !py-1.5"><option value="">Mudar categoria para…</option>{categories.map(c => <option key={c.id} value={c.id}>{'— '.repeat(c.depth - 1)}{c.name}</option>)}</select>
            <button type="button" disabled={pending || !categoryId} onClick={() => run('category', selected)} className="shrink-0 rounded border bg-white px-3 py-1.5 font-medium hover:border-brand disabled:opacity-50">Aplicar</button>
          </span>
          <button type="button" onClick={() => setSelected([])} className="text-slate-500 underline">Limpar seleção</button>
        </> : <span className="text-slate-500">Marque os produtos para ativar, inativar, excluir ou mudar a categoria em lote.</span>}
        {pending && <span className="text-slate-500">Aplicando… (com o Bling pode levar alguns segundos)</span>}
      </div>
      {(state.ok || state.error) && <p role={state.error ? 'alert' : 'status'} className={`border-x px-4 py-2 text-sm ${state.error ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>{state.error ?? state.ok}</p>}
      <div className="card overflow-x-auto !rounded-t-none">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-10 px-4 py-3"><input type="checkbox" aria-label="Selecionar todos" checked={allChecked} onChange={() => setSelected(allChecked ? [] : items.map(p => p.id))} /></th>
              <th className="min-w-[220px] px-3 py-3">Produto</th>
              <th className="px-3 py-3">Código</th>
              <th className="px-3 py-3">Categoria</th>
              <th className="px-3 py-3 text-right">Preço</th>
              <th className="px-3 py-3 text-right">Estoque</th>
              <th className="px-3 py-3 text-right">Pedidos</th>
              <th className="px-3 py-3">Situação</th>
              <th className="px-3 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map(p => {
              const available = p.stock - p.reserved;
              return (
                <tr key={p.id} className={selected.includes(p.id) ? 'bg-violet-50/60' : 'hover:bg-slate-50'}>
                  <td className="px-4 py-2"><input type="checkbox" aria-label={`Selecionar ${p.name}`} checked={selected.includes(p.id)} onChange={() => toggle(p.id)} /></td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/produtos/${p.id}`} className="flex items-center gap-3">
                      <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100">{p.images[0] && <img src={p.images[0].url} alt="" className="h-full w-full object-cover" />}</span>
                      <span className="min-w-0"><span className="line-clamp-2 font-medium text-brand">{p.name}</span>{(p.variantCount ?? 0) > 0 && <span className="block text-xs text-slate-400">{p.variantCount} variações</span>}</span>
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{p.sku}</td>
                  <td className="px-3 py-2 text-slate-600">{p.categoryNames?.join(', ') || <span className="text-slate-400">—</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{formatPrice(p.price)}</td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right ${available <= 3 ? 'font-semibold text-amber-700' : ''}`}>{available}{p.reserved > 0 && <span className="block text-xs font-normal text-slate-400">{p.reserved} reserv.</span>}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{p.orderLines ?? 0}</td>
                  <td className="px-3 py-2"><span className={`badge ${tone[p.status]}`}>{productStatusLabel[p.status]}</span></td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <span className="inline-flex gap-1">
                      <Link href={`/admin/produtos/${p.id}`} className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100">Editar</Link>
                      {p.status === 'ACTIVE'
                        ? <button type="button" disabled={pending} onClick={() => run('deactivate', [p.id])} className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100">Inativar</button>
                        : <button type="button" disabled={pending} onClick={() => run('activate', [p.id])} className="rounded px-2 py-1 text-emerald-700 hover:bg-emerald-50">Ativar</button>}
                      {p.canDelete
                        ? <button type="button" disabled={pending} onClick={() => run('delete', [p.id])} className="rounded px-2 py-1 text-red-700 hover:bg-red-50">Excluir</button>
                        : <span title="Já esteve em pedido (mesmo cancelado ou reembolsado): só pode ser inativado." className="cursor-help rounded px-2 py-1 text-slate-300">Excluir</span>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!items.length && <p className="p-8 text-center text-slate-500">Nenhum produto encontrado.</p>}
      </div>
    </div>
  );
}
