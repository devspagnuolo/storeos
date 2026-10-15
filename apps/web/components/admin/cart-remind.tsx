'use client';
import { useActionState } from 'react';
import { remindCartAction } from '../../app/admin/actions';

export function CartRemind({ id, again }: { id: string; again: boolean }) {
  const [state, action, pending] = useActionState(remindCartAction, {});
  return (
    <form action={action} className="text-right">
      <input type="hidden" name="id" value={id} />
      <button className="text-xs underline disabled:opacity-60" disabled={pending}>{pending ? 'Enviando…' : again ? 'Lembrar de novo' : 'Lembrar agora'}</button>
      {state.error && <p role="alert" className="mt-1 text-xs text-red-700">{state.error}</p>}
      {state.ok && <p role="status" className="mt-1 text-xs text-emerald-700">{state.ok}</p>}
    </form>
  );
}
