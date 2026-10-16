'use client';
import { useActionState, useId } from 'react';
import { subscribeNewsletterAction } from '../app/newsletter-actions';

export function NewsletterForm() {
  const [state, action, pending] = useActionState(subscribeNewsletterAction, {});
  // Pode haver dois formulários na página (seção do tema e rodapé): cada um com seu próprio id.
  const inputId = useId();
  return (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <label className="sr-only" htmlFor={inputId}>Seu e-mail</label>
      <div className="flex gap-2">
        <input id={inputId} name="email" type="email" required maxLength={254} autoComplete="email" placeholder="Seu melhor e-mail" className="input min-w-0 flex-1" />
        <button className="button shrink-0 disabled:opacity-60" disabled={pending}>Quero receber</button>
      </div>
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      {state.error && <p role="alert" className="text-xs text-red-700">{state.error}</p>}
      {state.ok && <p role="status" className="text-xs text-emerald-700">{state.ok}</p>}
    </form>
  );
}
