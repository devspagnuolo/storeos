'use client';
import { useActionState } from 'react';
import { saveWhatsappAction } from '../../app/admin/actions';

export function WhatsappForm({ number, message }: { number: string | null; message: string | null }) {
  const [state, action, pending] = useActionState(saveWhatsappAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[220px_1fr_auto] sm:items-end">
      <label className="text-sm font-medium">WhatsApp com DDD<input name="number" defaultValue={number ?? ''} className="input" placeholder="(21) 99999-8888" inputMode="tel" /></label>
      <label className="text-sm font-medium">Mensagem inicial (opcional)<input name="message" maxLength={200} defaultValue={message ?? ''} className="input" placeholder="Olá! Vim pelo site e gostaria de ajuda." /></label>
      <button className="button disabled:opacity-60" disabled={pending}>Salvar</button>
      <p className="text-xs text-slate-500 sm:col-span-3">Deixe o número vazio para remover o botão da loja.</p>
      {state.error && <p role="alert" className="text-sm text-red-700 sm:col-span-3">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-700 sm:col-span-3">{state.ok}</p>}
    </form>
  );
}
