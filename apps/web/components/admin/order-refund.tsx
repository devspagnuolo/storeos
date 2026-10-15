'use client';
import { useActionState } from 'react';
import { refundOrderAction } from '../../app/admin/actions';
import type { OrderRefunds } from '../../lib/admin/types';
import { formatPrice } from '../../lib/format';
import { formatDateTime } from '../../lib/admin/labels';

const STATUS = { PENDING: 'Em andamento', DONE: 'Concluído', FAILED: 'Recusado' } as const;

/** Reembolso total ou parcial: pelo Mercado Pago (devolve o dinheiro) ou registro manual de um estorno feito fora do sistema. */
export function OrderRefund({ number, data }: { number: string; data: OrderRefunds }) {
  const [state, action, pending] = useActionState(refundOrderAction, {});
  const remaining = Number(data.remaining);
  return (
    <form action={action} className="card p-5 text-sm">
      <h2 className="font-bold">Reembolso</h2>
      <input type="hidden" name="number" value={number} />
      <p className="mt-2 text-slate-600">Pago {data.paid ? formatPrice(data.paid) : '—'} · ainda pode devolver <strong>{formatPrice(data.remaining)}</strong></p>
      {data.refunds.length > 0 && <ul className="mt-3 space-y-2 border-l-2 border-slate-200 pl-3">{data.refunds.map(refund => <li key={refund.id}>
        <p><strong>{formatPrice(refund.amount)}</strong> · {refund.mode === 'GATEWAY' ? 'Mercado Pago' : 'Manual'} · {STATUS[refund.status]}</p>
        <p className="text-xs text-slate-500">{formatDateTime(refund.createdAt)} · {refund.reason}</p>
        {refund.error && <p className="text-xs text-red-700">{refund.error}</p>}
      </li>)}</ul>}
      {remaining > 0 && <div className="mt-4 space-y-3">
        <label className="block font-medium">Valor (vazio = tudo que resta)<input name="amount" inputMode="decimal" placeholder={data.remaining} className="input" /></label>
        <label className="block font-medium">Motivo<input name="reason" required minLength={3} maxLength={280} className="input" /></label>
        <label className="block font-medium">Como devolver
          <select name="mode" defaultValue={data.gatewayAvailable ? 'GATEWAY' : 'MANUAL'} className="input">
            {data.gatewayAvailable && <option value="GATEWAY">Devolver pelo Mercado Pago agora</option>}
            <option value="MANUAL">Só registrar (já devolvi por fora)</option>
          </select>
        </label>
        <label className="flex items-start gap-2"><input type="checkbox" name="confirm" className="mt-1" /><span>Confirmo o reembolso. Ele não pode ser desfeito. Se for total e o pedido ainda não saiu, os itens voltam ao estoque.</span></label>
        <button className="button w-full disabled:opacity-60" disabled={pending}>{pending ? 'Reembolsando…' : 'Reembolsar'}</button>
      </div>}
      {state.error && <p role="alert" className="mt-3 text-red-700">{state.error}</p>}
      {state.ok && <p role="status" className="mt-3 text-emerald-700">{state.ok}</p>}
    </form>
  );
}
