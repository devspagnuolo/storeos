'use client';
import { useActionState } from 'react';
import { orderTransitionAction } from '../../app/admin/actions';

/** Confirmar pagamento ou cancelar; só aparece para pedidos que ainda aceitam essas transições. */
export function OrderActions({ number, status }: { number: string; status: string }) {
  const [state, action, pending] = useActionState(orderTransitionAction, {});
  if (status !== 'AWAITING_PAYMENT' && status !== 'NEW') return state.ok ? <p className="text-sm text-emerald-700">{state.ok}</p> : null;
  return (
    <form action={action} className="card p-5">
      <h2 className="font-bold">Ações</h2>
      <input type="hidden" name="number" value={number} />
      <label className="mt-3 block text-sm font-medium">Observação (opcional)<input name="message" maxLength={280} className="input" placeholder="Ex.: comprovante recebido por e-mail" /></label>
      <div className="mt-4 flex flex-wrap gap-3">
        {status === 'AWAITING_PAYMENT' && <button name="action" value="confirm" className="button disabled:opacity-60" disabled={pending}>Confirmar pagamento</button>}
        <button name="action" value="cancel" className="button-ghost disabled:opacity-60" disabled={pending} onClick={e => { if (!confirm('Cancelar este pedido e devolver o estoque?')) e.preventDefault(); }}>Cancelar pedido</button>
      </div>
      {state.error && <p role="alert" className="mt-3 text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="mt-3 text-sm text-emerald-700">{state.ok}</p>}
    </form>
  );
}
