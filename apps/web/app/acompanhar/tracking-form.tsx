'use client';
import { useActionState } from 'react';
import { trackOrderAction, type TrackState } from './actions';

const date = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';

export function TrackingForm({ initialNumber }: { initialNumber?: string }) {
  const [state, action, pending] = useActionState<TrackState, FormData>(trackOrderAction, {});
  const order = state.order;
  return <>
    <form action={action} className="mt-6 grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium">Número do pedido<input name="number" required defaultValue={state.number ?? initialNumber} className="input mt-1" autoComplete="off" /></label>
      <label className="text-sm font-medium">E-mail da compra<input name="email" type="email" required defaultValue={state.email} className="input mt-1" autoComplete="email" autoFocus={Boolean(initialNumber)} /></label>
      <div className="sm:col-span-2"><button disabled={pending} className="button">{pending ? 'Consultando…' : 'Acompanhar pedido'}</button></div>
    </form>
    {state.error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
    {order && <section aria-label={`Pedido ${order.number}`} className="mt-8">
      <h2 className="text-xl font-bold">Pedido {order.number}</h2>
      <p className="mt-1 text-sm text-slate-500">Situação atual: <strong className="text-slate-900">{order.statusLabel}</strong></p>
      {order.tracking && <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50 p-4 text-sm">
        <p>Enviado{order.tracking.carrier ? ` por ${order.tracking.carrier}` : ''}. Código de rastreio: <strong>{order.tracking.code}</strong></p>
        {order.tracking.url && <a href={order.tracking.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-semibold text-brand">Acompanhar a entrega →</a>}
      </div>}
      <ol className="mt-6 space-y-3 border-l-2 border-slate-200 pl-4">
        {order.timeline.map((entry, index) => <li key={index} className="text-sm"><strong>{entry.label}</strong><span className="ml-2 text-slate-500">{date(entry.at)}</span></li>)}
      </ol>
      <h3 className="mt-6 font-semibold">Itens</h3>
      <ul className="mt-2 text-sm text-slate-600">{order.items.map((item, index) => <li key={index}>{item.quantity}× {item.name}</li>)}</ul>
    </section>}
  </>;
}
