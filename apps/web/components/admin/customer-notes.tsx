'use client';
import { useActionState } from 'react';
import { addCustomerNoteAction, deleteCustomerNoteAction } from '../../app/admin/actions';
import { formatDateTime } from '../../lib/admin/labels';
import type { CustomerProfile } from '../../lib/admin/types';

export function CustomerNotes({ customer }: { customer: CustomerProfile }) {
  const [state, add, adding] = useActionState(addCustomerNoteAction, {});
  const [, remove] = useActionState(deleteCustomerNoteAction, {});
  return (
    <section className="card p-5">
      <h2 className="font-bold">Anotações da equipe</h2>
      {customer.notes && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><span className="font-semibold">Observação antiga:</span> {customer.notes}</p>}
      <form action={add} key={customer.noteEntries.length} className="mt-3">
        <input type="hidden" name="id" value={customer.id} />
        <textarea name="body" rows={3} maxLength={2000} required placeholder="Ex.: prefere entrega à tarde, pediu troca de tamanho" className="input" />
        {state.error && <p role="alert" className="mt-2 text-sm text-red-700">{state.error}</p>}
        <button className="button mt-2 disabled:opacity-60" disabled={adding}>Adicionar anotação</button>
      </form>
      <ul className="mt-4 space-y-3">
        {customer.noteEntries.map(n => (
          <li key={n.id} className="rounded-lg border p-3 text-sm">
            <p className="whitespace-pre-wrap">{n.body}</p>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
              <span>{n.authorName} · {formatDateTime(n.createdAt)}</span>
              <form action={remove}><input type="hidden" name="id" value={customer.id} /><input type="hidden" name="noteId" value={n.id} /><button className="text-red-700 underline">Apagar</button></form>
            </div>
          </li>))}
      </ul>
    </section>
  );
}
