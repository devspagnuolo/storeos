'use client';
import { useActionState } from 'react';
import { createBrandAction, saveCollectionAction } from '../../app/admin/actions';
import type { AdminCollection } from '../../lib/admin/types';

export function BrandForm() {
  const [state, action, pending] = useActionState(createBrandAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="grow text-sm font-medium">Nova marca<input name="name" required minLength={2} maxLength={80} className="input" /></label>
      <button className="button disabled:opacity-60" disabled={pending}>Adicionar</button>
      {state.error && <p role="alert" className="w-full text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="w-full text-sm text-emerald-700">{state.ok}</p>}
    </form>
  );
}

export function CollectionForm({ collection }: { collection?: AdminCollection }) {
  const [state, action, pending] = useActionState(saveCollectionAction, {});
  return (
    <form action={action} className="grid gap-3">
      {collection && <input type="hidden" name="id" value={collection.id} />}
      <label className="text-sm font-medium">Nome<input name="name" required minLength={2} maxLength={80} defaultValue={collection?.name} className="input" /></label>
      <label className="text-sm font-medium">Descrição<input name="description" maxLength={500} defaultValue={collection?.description ?? ''} className="input" /></label>
      <label className="text-sm font-medium">SKUs dos produtos <span className="font-normal text-slate-400">(separados por vírgula ou linha)</span><textarea name="skus" rows={3} defaultValue={collection?.skus.join(', ')} className="input font-mono text-xs" /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={collection?.active ?? true} /> Visível na loja</label>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      <button className="button disabled:opacity-60" disabled={pending}>{collection ? 'Salvar' : 'Criar coleção'}</button>
    </form>
  );
}
