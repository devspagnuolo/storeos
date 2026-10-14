'use client';
import { useActionState } from 'react';
import { orderFulfillmentAction } from '../../app/admin/actions';
import type { OrderDetail } from '../../lib/admin/types';

type Props = { number: string; status: string; fulfillment: OrderDetail['fulfillment'] };

/** Próxima etapa logística do pedido: separar, faturar, enviar, confirmar entrega ou registrar devolução. */
export function OrderFulfillment({ number, status, fulfillment }: Props) {
  const [state, action, pending] = useActionState(orderFulfillmentAction, {});
  const feedback = <>{state.error && <p role="alert" className="mt-3 text-sm text-red-700">{state.error}</p>}{state.ok && <p className="mt-3 text-sm text-emerald-700">{state.ok}</p>}</>;
  const summary = fulfillment && (
    <dl className="space-y-1 text-sm text-slate-600">
      {fulfillment.invoiceNumber && <div>Nota fiscal <b>{fulfillment.invoiceNumber}</b></div>}
      {fulfillment.carrier && <div>{fulfillment.carrier} · {fulfillment.trackingUrl ? <a className="text-brand underline" href={fulfillment.trackingUrl} target="_blank" rel="noopener noreferrer">{fulfillment.trackingCode}</a> : fulfillment.trackingCode}</div>}
      {fulfillment.returnReason && <div>Motivo da devolução: {fulfillment.returnReason}</div>}
    </dl>
  );
  const button = (step: string, label: string, ghost = false) => <button name="step" value={step} className={`${ghost ? 'button-ghost' : 'button'} disabled:opacity-60`} disabled={pending}>{label}</button>;
  let fields: React.ReactNode = null;
  if (status === 'PAID') fields = <><p className="text-sm text-slate-600">Pagamento confirmado. Inicie a separação dos itens.</p><div className="mt-3">{button('pick', 'Iniciar separação')}</div></>;
  else if (status === 'PICKING') fields = <><label className="block text-sm font-medium">Número da nota fiscal<input name="invoiceNumber" required maxLength={60} className="input" /></label><label className="mt-3 block text-sm font-medium">Chave de acesso (opcional)<input name="invoiceKey" maxLength={60} className="input" /></label><div className="mt-3">{button('invoice', 'Registrar faturamento')}</div></>;
  else if (status === 'INVOICED') fields = <><label className="block text-sm font-medium">Transportadora<input name="carrier" required maxLength={80} className="input" placeholder="Correios, Jadlog…" /></label><label className="mt-3 block text-sm font-medium">Código de rastreio<input name="trackingCode" required maxLength={80} className="input" /></label><label className="mt-3 block text-sm font-medium">Link de rastreio (opcional)<input name="trackingUrl" type="url" maxLength={500} className="input" /></label><div className="mt-3">{button('ship', 'Registrar envio')}</div></>;
  else if (status === 'SHIPPED') fields = <div>{button('deliver', 'Confirmar entrega')}</div>;
  else if (status === 'DELIVERED') fields = <><label className="block text-sm font-medium">Registrar devolução – motivo<input name="reason" required maxLength={280} className="input" /></label><div className="mt-3">{button('return', 'Registrar devolução', true)}</div></>;
  if (!fields && !summary && !state.ok) return null;
  return (
    <form action={action} className="card p-5">
      <h2 className="font-bold">Expedição</h2>
      <input type="hidden" name="number" value={number} />
      <div className="mt-3">{summary}</div>
      {fields && <div className="mt-3">{fields}</div>}
      {feedback}
    </form>
  );
}
