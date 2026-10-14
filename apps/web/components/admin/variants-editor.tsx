'use client';
import { useActionState, useState } from 'react';
import { saveVariantsAction } from '../../app/admin/actions';
import type { AdminProduct, AdminVariant } from '../../lib/admin/types';

type Row = { id?: string; values: string[]; sku: string; price: string; stock: string; reserved: number; active: boolean };

const csv = (value: string) => [...new Set(value.split(',').map(v => v.trim()).filter(Boolean))];
const slug = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
const toRow = (variant: AdminVariant): Row => ({ id: variant.id, values: variant.attributes.map(a => a.value), sku: variant.sku, price: variant.price ?? '', stock: String(variant.stock), reserved: variant.reserved, active: variant.active });

export function VariantsEditor({ product }: { product: AdminProduct }) {
  const initial = product.variants ?? [];
  const [state, action, pending] = useActionState(saveVariantsAction, {});
  const [names, setNames] = useState<string[]>(initial[0] ? initial[0].attributes.map(a => a.name) : ['Cor', 'Tamanho']);
  const [rows, setRows] = useState<Row[]>(initial.map(toRow));
  const [generator, setGenerator] = useState<string[]>(names.map(() => ''));

  // Cruza os valores digitados (ex.: Preto, Vinho × G, GG, G1) e mantém o que já estava cadastrado.
  function generate() {
    const lists = generator.map(csv);
    if (lists.some(list => !list.length)) return;
    const combos = lists.reduce<string[][]>((acc, list) => acc.flatMap(prefix => list.map(value => [...prefix, value])), [[]]);
    setRows(current => [
      ...current,
      ...combos.filter(values => !current.some(row => row.values.join('|').toLowerCase() === values.join('|').toLowerCase())).map(values => ({ values, sku: `${product.sku}-${values.map(slug).join('-')}`, price: '', stock: '0', reserved: 0, active: true })),
    ]);
    setGenerator(names.map(() => ''));
  }
  const update = (index: number, patch: Partial<Row>) => setRows(current => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const payload = rows.map(row => ({
    ...(row.id && { id: row.id }), sku: row.sku.trim(), attributes: names.map((name, i) => ({ name: name.trim(), value: (row.values[i] ?? '').trim() })),
    price: row.price.trim() ? Number(row.price.replace(',', '.')) : null, stock: Number(row.stock) || 0, active: row.active,
  }));

  return (
    <form action={action} className="card mt-8 p-6">
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="variants" value={JSON.stringify(payload)} />
      <h2 className="text-lg font-bold">Variações (cor, tamanho…)</h2>
      <p className="mt-1 text-sm text-slate-500">Cada combinação tem SKU, preço e estoque próprios. Com variações, o estoque do produto passa a ser a soma delas. Preço em branco usa o preço do produto.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {names.map((name, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-slate-200 p-3">
            <label className="text-sm font-medium">Atributo {i + 1}<input value={name} onChange={e => setNames(current => current.map((n, j) => (j === i ? e.target.value : n)))} maxLength={40} className="input" disabled={rows.length > 0} /></label>
            <label className="text-sm font-medium">Valores <span className="font-normal text-slate-400">(separados por vírgula)</span><input value={generator[i] ?? ''} onChange={e => setGenerator(current => current.map((g, j) => (j === i ? e.target.value : g)))} className="input" placeholder={i === 0 ? 'Preto, Marrom, Vinho' : 'G, GG, G1, G2'} /></label>
          </div>))}
      </div>
      <button type="button" onClick={generate} className="button-ghost mt-3 text-sm">Gerar combinações</button>
      {rows.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500"><tr>{names.map(n => <th key={n} className="pr-2">{n}</th>)}<th className="pr-2">SKU</th><th className="pr-2">Preço (R$)</th><th className="pr-2">Estoque</th><th>Ativa</th><th /></tr></thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id ?? `${row.sku}-${index}`} className="border-t">
                  {names.map((name, i) => <td key={name} className="py-1 pr-2"><input value={row.values[i] ?? ''} onChange={e => update(index, { values: names.map((_, j) => (j === i ? e.target.value : row.values[j] ?? '')) })} className="input w-28" aria-label={name} /></td>)}
                  <td className="pr-2"><input value={row.sku} onChange={e => update(index, { sku: e.target.value })} className="input w-44 font-mono text-xs" aria-label="SKU" /></td>
                  <td className="pr-2"><input value={row.price} onChange={e => update(index, { price: e.target.value })} inputMode="decimal" className="input w-24" aria-label="Preço" placeholder="do produto" /></td>
                  <td className="pr-2"><input value={row.stock} onChange={e => update(index, { stock: e.target.value })} inputMode="numeric" className="input w-20" aria-label="Estoque" />{row.reserved > 0 && <span className="block text-xs text-slate-400">{row.reserved} reservadas</span>}</td>
                  <td><input type="checkbox" checked={row.active} onChange={e => update(index, { active: e.target.checked })} aria-label="Ativa" /></td>
                  <td><button type="button" onClick={() => setRows(current => current.filter((_, i) => i !== index))} className="text-xs text-red-700 underline">Remover</button></td>
                </tr>))}
            </tbody>
          </table>
        </div>)}
      {state.error && <p role="alert" className="mt-4 text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="mt-4 text-sm text-emerald-700">{state.ok}</p>}
      <button className="button mt-4 disabled:opacity-60" disabled={pending}>Salvar variações</button>
    </form>
  );
}
