'use client';
import { useActionState } from 'react';
import { saveCategoryAction } from '../../app/admin/actions';
import type { Category } from '../../lib/api';

export function CategoryForm({ category, roots }: { category?: Category; roots: Category[] }) {
  const [state, action, pending] = useActionState(saveCategoryAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      {category && <input type="hidden" name="id" value={category.id} />}
      <label className="grow text-sm font-medium">{category ? 'Nome' : 'Nova categoria'}<input name="name" required minLength={2} maxLength={80} defaultValue={category?.name} className="input" /></label>
      <label className="text-sm font-medium">Dentro de
        <select name="parentId" defaultValue={category?.parentId ?? ''} className="input">
          <option value="">Principal (sem pai)</option>
          {roots.filter(root => root.id !== category?.id).map(root => <option key={root.id} value={root.id}>{root.name}</option>)}
        </select>
      </label>
      <button className="button disabled:opacity-60" disabled={pending}>{category ? 'Salvar' : 'Adicionar'}</button>
      {state.error && <p role="alert" className="w-full text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="w-full text-sm text-emerald-700">{state.ok}</p>}
    </form>
  );
}
