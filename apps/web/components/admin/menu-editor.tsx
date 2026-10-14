'use client';
import { useActionState, useState } from 'react';
import { saveMenuAction } from '../../app/admin/actions';
import type { AdminMenu, AdminMenuItem, MenuItemType, MenuOption } from '../../lib/admin/types';

const typeLabels: Record<MenuItemType, string> = { CATEGORY: 'Categoria', COLLECTION: 'Coleção', BRAND: 'Marca', PAGE: 'Página', LINK: 'Link', ALL: 'Todos os produtos' };

export function MenuEditor({ menu }: { menu: AdminMenu }) {
  const [items, setItems] = useState<AdminMenuItem[]>(menu.items);
  const [state, action, pending] = useActionState(saveMenuAction, {});
  const optionsFor = (type: MenuItemType): MenuOption[] => ({ CATEGORY: menu.options.categories, COLLECTION: menu.options.collections, BRAND: menu.options.brands, PAGE: menu.options.pages, LINK: [], ALL: [] })[type];

  const patch = (path: number[], change: (item: AdminMenuItem) => AdminMenuItem) => setItems(current => {
    const next = structuredClone(current);
    const list = path.length === 1 ? next : next[path[0]].children!;
    list[path[path.length - 1]] = change(list[path[path.length - 1]]);
    return next;
  });
  const listOp = (parent: number | null, op: (list: AdminMenuItem[]) => void) => setItems(current => {
    const next = structuredClone(current);
    if (parent === null) op(next);
    else { next[parent].children ??= []; op(next[parent].children); if (!next[parent].children.length) delete next[parent].children; }
    return next;
  });
  const move = (parent: number | null, index: number, delta: number) => listOp(parent, list => { const to = index + delta; if (to >= 0 && to < list.length) [list[index], list[to]] = [list[to], list[index]]; });

  const row = (item: AdminMenuItem, path: number[]) => {
    const parent = path.length === 2 ? path[0] : null;
    const index = path[path.length - 1];
    const options = optionsFor(item.type);
    return (
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium">Nome<input value={item.label} maxLength={40} onChange={e => patch(path, i => ({ ...i, label: e.target.value }))} className="input w-40" /></label>
        <label className="text-xs font-medium">Tipo
          <select value={item.type} onChange={e => patch(path, i => ({ label: i.label, type: e.target.value as MenuItemType, children: i.children }))} className="input">
            {(Object.keys(typeLabels) as MenuItemType[]).map(type => <option key={type} value={type}>{typeLabels[type]}</option>)}
          </select>
        </label>
        {item.type === 'LINK' && <label className="text-xs font-medium">Endereço<input value={item.ref ?? ''} placeholder="/p/trocas ou https://..." onChange={e => patch(path, i => ({ ...i, ref: e.target.value }))} className="input w-56" /></label>}
        {options.length > 0 && item.type !== 'LINK' && (
          <label className="text-xs font-medium">Destino
            <select value={item.ref ?? ''} onChange={e => patch(path, i => ({ ...i, ref: e.target.value }))} className="input">
              <option value="">Escolha…</option>
              {options.map(o => <option key={o.slug} value={o.slug}>{o.parentId ? '— ' : ''}{o.name}</option>)}
            </select>
          </label>)}
        {options.length === 0 && item.type !== 'LINK' && item.type !== 'ALL' && <span className="pb-2 text-xs text-amber-700">Nada cadastrado deste tipo ainda.</span>}
        <div className="flex gap-1 pb-1 text-sm">
          <button type="button" aria-label="Subir" onClick={() => move(parent, index, -1)} className="rounded border px-2 py-1">↑</button>
          <button type="button" aria-label="Descer" onClick={() => move(parent, index, 1)} className="rounded border px-2 py-1">↓</button>
          {parent === null && <button type="button" onClick={() => listOp(index, list => list.push({ label: '', type: 'CATEGORY' }))} className="rounded border px-2 py-1">+ Subitem</button>}
          <button type="button" aria-label="Remover" onClick={() => listOp(parent, list => list.splice(index, 1))} className="rounded border border-red-200 px-2 py-1 text-red-700">Remover</button>
        </div>
      </div>
    );
  };

  return (
    <form action={action} className="mt-6 grid gap-4">
      <input type="hidden" name="key" value={menu.key} />
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <ul className="grid gap-3">
        {items.map((item, i) => (
          <li key={i} className="card p-3">
            {row(item, [i])}
            {item.children && item.children.length > 0 && <ul className="mt-3 grid gap-2 border-l-2 border-slate-200 pl-4">{item.children.map((child, c) => <li key={c}>{row(child, [i, c])}</li>)}</ul>}
          </li>))}
        {!items.length && <li className="card p-6 text-center text-sm text-slate-500">Menu vazio. Adicione o primeiro item.</li>}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setItems(current => [...current, { label: '', type: 'CATEGORY' }])} className="rounded border px-3 py-2 text-sm font-medium">+ Adicionar item</button>
        <button className="button disabled:opacity-60" disabled={pending}>Salvar menu</button>
        {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
        {state.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      </div>
    </form>
  );
}
