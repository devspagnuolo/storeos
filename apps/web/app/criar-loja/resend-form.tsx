'use client';
import { useActionState } from 'react';
import { resendAction, type ResendState } from './actions';

export function ResendForm() {
  const [state, action, pending] = useActionState<ResendState, FormData>(resendAction, {});
  if (state.ok) return <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-800">Se os dados estiverem certos, um novo link está a caminho do seu e-mail.</p>;
  return (
    <form action={action} className="mt-6">
      <p className="text-sm font-medium">Receber um novo link</p>
      <label className="mt-2 block text-sm">Endereço da loja<input name="storeSlug" required className="input" /></label>
      <label className="mt-2 block text-sm">E-mail<input name="email" type="email" required className="input" /></label>
      {state.error && <p role="alert" className="mt-3 text-sm text-red-700">{state.error}</p>}
      <button className="button mt-4 w-full disabled:opacity-60" disabled={pending}>{pending ? 'Enviando…' : 'Reenviar link'}</button>
    </form>
  );
}
