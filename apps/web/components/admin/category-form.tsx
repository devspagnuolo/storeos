'use client';
import { useActionState } from 'react';
import { saveCategoryAction } from '../../app/admin/actions';
import type { Category } from '../../lib/api';

export type ParentChoice = { id: string; name: string; depth: number };

export function CategoryForm({ category, parents }: { category?: Category & { position?: number }; parents: ParentChoice[] }) {
  const [state, action, pending] = useActionState(saveCategoryAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      {category && <input type="hidden" name="id" value={category.id} />}
      <label className="grow text-sm font-medium">{category ? 'Nome' : 'Nova categoria'}<input name="name" required minLength={2} maxLength={80} defaultValue={category?.name} className="input" /></label>
      <label className="text-sm font-medium">Dentro de
        <select name="parentId" defaultValue={category?.parentId ?? ''} className="input">
          <option value="">Principal (sem pai)</option>
          {parents.map(parent => <option key={parent.id} value={parent.id}>{'— '.repeat(parent.depth - 1)}{parent.name}</option>)}
        </select>
      </label>
      {category && <label className="w-20 text-sm font-medium" title="Menor número aparece primeiro">Ordem<input name="position" type="number" min={0} max={9999} defaultValue={category.position ?? 0} className="input" /></label>}
      <button className="button disabled:opacity-60" disabled={pending}>{category ? 'Salvar' : 'Adicionar'}</button>
      {state.error && <p role="alert" className="w-full text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="w-full text-sm text-emerald-700">{state.ok}</p>}
    </form>
  );
}
