'use client';
import { useActionState, useState } from 'react';
import { saveMenuAction } from '../../app/admin/actions';
import type { AdminMenu, AdminMenuItem, MenuItemType, MenuOption } from '../../lib/admin/types';
import { buildTree, TreeNode } from '../../lib/category-tree';

const typeLabels: Record<MenuItemType, string> = { CATEGORY: 'Categoria', COLLECTION: 'Coleção', BRAND: 'Marca', PAGE: 'Página', LINK: 'Link', ALL: 'Todos os produtos' };
const MAX_LEVELS = 4;

type Path = number[];
const listAt = (items: AdminMenuItem[], path: Path) => path.reduce<AdminMenuItem[]>((list, index) => (list[index].children ??= []), items);

/** Menu inteiro a partir da árvore de categorias (Blusas > Manga Longa > Renda). */
function fromCategories(categories: MenuOption[]): AdminMenuItem[] {
  const nodes = categories.filter((c): c is MenuOption & { id: string } => Boolean(c.id)).map(c => ({ ...c, parentId: c.parentId ?? null }));
  const convert = (node: TreeNode<(typeof nodes)[number]>): AdminMenuItem => ({ label: node.name.slice(0, 40), type: 'CATEGORY', ref: node.slug, ...(node.children.length && { children: node.children.map(convert) }) });
  return buildTree(nodes).map(convert);
}

export function MenuEditor({ menu }: { menu: AdminMenu }) {
  const [items, setItems] = useState<AdminMenuItem[]>(menu.items);
  const [state, action, pending] = useActionState(saveMenuAction, {});
  const optionsFor = (type: MenuItemType): MenuOption[] => ({ CATEGORY: menu.options.categories, COLLECTION: menu.options.collections, BRAND: menu.options.brands, PAGE: menu.options.pages, LINK: [], ALL: [] })[type];

  const edit = (change: (root: AdminMenuItem[]) => void) => setItems(current => { const next = structuredClone(current); change(next); return next; });
  const patch = (path: Path, change: (item: AdminMenuItem) => AdminMenuItem) => edit(root => { const list = listAt(root, path.slice(0, -1)); list[path[path.length - 1]] = change(list[path[path.length - 1]]); });
  const prune = (list: AdminMenuItem[], index: number) => { list.splice(index, 1); };
  const clean = (root: AdminMenuItem[], path: Path) => { for (let depth = path.length; depth > 0; depth--) { const owner = listAt(root, path.slice(0, depth - 1))[path[depth - 1]]; if (owner?.children && !owner.children.length) delete owner.children; else break; } };

  const move = (path: Path, delta: number) => edit(root => {
    const list = listAt(root, path.slice(0, -1));
    const index = path[path.length - 1];
    const to = index + delta;
    if (to >= 0 && to < list.length) [list[index], list[to]] = [list[to], list[index]];
  });

  const row = (item: AdminMenuItem, path: Path) => {
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
              {options.map(o => <option key={o.slug} value={o.slug}>{o.name}</option>)}
            </select>
          </label>)}
        {options.length === 0 && item.type !== 'LINK' && item.type !== 'ALL' && <span className="pb-2 text-xs text-amber-700">Nada cadastrado deste tipo ainda.</span>}
        <div className="flex gap-1 pb-1 text-sm">
          <button type="button" aria-label="Subir" onClick={() => move(path, -1)} className="rounded border px-2 py-1">↑</button>
          <button type="button" aria-label="Descer" onClick={() => move(path, 1)} className="rounded border px-2 py-1">↓</button>
          {path.length < MAX_LEVELS && <button type="button" onClick={() => edit(root => { (listAt(root, path)).push({ label: '', type: 'CATEGORY' }); })} className="rounded border px-2 py-1">+ Subitem</button>}
          <button type="button" aria-label="Remover" onClick={() => edit(root => { prune(listAt(root, path.slice(0, -1)), path[path.length - 1]); clean(root, path.slice(0, -1)); })} className="rounded border border-red-200 px-2 py-1 text-red-700">Remover</button>
        </div>
      </div>
    );
  };

  const tree = (list: AdminMenuItem[], parent: Path): React.ReactNode => (
    <ul className={parent.length ? 'mt-3 grid gap-2 border-l-2 border-slate-200 pl-4' : 'grid gap-3'}>
      {list.map((item, i) => {
        const path = [...parent, i];
        return <li key={path.join('-')} className={parent.length ? '' : 'card p-3'}>{row(item, path)}{item.children && item.children.length > 0 && tree(item.children, path)}</li>;
      })}
      {!parent.length && !list.length && <li className="card p-6 text-center text-sm text-slate-500">Menu vazio. Adicione o primeiro item ou gere o menu a partir das categorias.</li>}
    </ul>
  );

  return (
    <form action={action} className="mt-6 grid gap-4">
      <input type="hidden" name="key" value={menu.key} />
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      {tree(items, [])}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setItems(current => [...current, { label: '', type: 'CATEGORY' }])} className="rounded border px-3 py-2 text-sm font-medium">+ Adicionar item</button>
        {menu.options.categories.length > 0 && (
          <button type="button" onClick={() => { if (!items.length || confirm('Isto troca o menu que está na tela pelas categorias da loja. Continuar?')) setItems(fromCategories(menu.options.categories)); }} className="rounded border px-3 py-2 text-sm font-medium">Gerar a partir das categorias</button>)}
        <button className="button disabled:opacity-60" disabled={pending}>Salvar menu</button>
        {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
        {state.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      </div>
    </form>
  );
}
