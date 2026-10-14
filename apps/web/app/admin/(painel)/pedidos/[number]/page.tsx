import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OrderActions } from '../../../../../components/admin/order-actions';
import { OrderFulfillment } from '../../../../../components/admin/order-fulfillment';
import { StatusBadge } from '../../../../../components/admin/status-badge';
import { formatDateTime, orderStatusLabel, paymentMethodLabel } from '../../../../../lib/admin/labels';
import { adminFetch, ApiError } from '../../../../../lib/admin/session';
import type { OrderDetail } from '../../../../../lib/admin/types';
import { formatPrice } from '../../../../../lib/format';
import { requestBlingInvoiceAction } from '../../../actions';

export const dynamic = 'force-dynamic';

const paymentStatusLabel: Record<string, string> = { PENDING: 'Pendente', AUTHORIZED: 'Autorizado', PAID: 'Pago', FAILED: 'Recusado', REFUNDED: 'Reembolsado', CANCELLED: 'Cancelado' };

export default async function OrderPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const order = await adminFetch<OrderDetail>(`/orders/${encodeURIComponent(number)}`).catch(error => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
  const address = order.shippingAddress;\n  const invoice = await adminFetch<{ status: string; invoiceNumber: string | null; series: string | null; accessKey: string | null; rejectionReason: string | null; authorizedAt: string | null; issuedAt: string | null }>(`/bling/orders/${encodeURIComponent(number)}/invoice`).catch(() => null);
  return (
    <>
      <Link href="/admin/pedidos" className="text-sm text-slate-500">← Pedidos</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold">{order.number}</h1><StatusBadge status={order.status} /></div>
      <p className="mt-1 text-sm text-slate-500">Criado em {formatDateTime(order.createdAt)}</p>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="card overflow-hidden">
            <h2 className="p-5 font-bold">Itens</h2>
            <table className="w-full text-sm"><tbody className="divide-y">{order.items.map(item => <tr key={item.id}><td className="px-5 py-3">{item.name}<p className="text-xs text-slate-400">SKU {item.sku}</p></td><td className="px-5 py-3 text-right">{item.quantity} × {formatPrice(item.unitPrice)}</td><td className="px-5 py-3 text-right font-semibold">{formatPrice(item.total)}</td></tr>)}</tbody></table>
            <div className="space-y-1 border-t p-5 text-sm"><div className="flex justify-between"><span>Subtotal</span><span>{formatPrice(order.subtotal)}</span></div><div className="flex justify-between"><span>Frete{order.shippingMethod && ` (${order.shippingMethod})`}</span><span>{formatPrice(order.shipping)}</span></div><div className="flex justify-between text-base font-bold"><span>Total</span><span>{formatPrice(order.total)}</span></div></div>
          </section>
          <section className="card p-5">
            <h2 className="font-bold">Histórico</h2>
            <ol className="mt-4 space-y-3 border-l-2 border-slate-200 pl-4 text-sm">{order.timeline.map(event => <li key={event.id}><p className="font-medium">{orderStatusLabel[event.status] ?? event.status}</p><p className="text-slate-500">{event.message}</p><p className="text-xs text-slate-400">{formatDateTime(event.createdAt)}</p></li>)}</ol>
          </section>
        </div>
        <aside className="space-y-6">
          <OrderActions number={order.number} status={order.status} />
          <OrderFulfillment number={order.number} status={order.status} fulfillment={order.fulfillment} />
          <section className="card p-5 text-sm">
            <h2 className="font-bold">ERP Bling</h2>
            <p className="mt-3 text-slate-600">Pedido STOREOS <strong>#{order.number}</strong></p>
            <p className="mt-1 text-slate-600">Pedido Bling <strong>{order.blingSync?.blingOrderNumber ? '#' + order.blingSync.blingOrderNumber : order.blingSync?.status === 'FAILED' ? 'com erro no envio' : order.blingSync ? 'na fila de envio' : 'ainda não sincronizado'}</strong></p>
            {order.blingSync?.blingSituationName && <p className="mt-2 text-slate-500">Situação no Bling: {order.blingSync.blingSituationName}</p>}
            {!order.blingSync?.blingSituationName && order.blingSync?.blingSituationId && <p className="mt-2 text-slate-500">Situação Bling ID {order.blingSync.blingSituationId}</p>}
          </section>
          <section className="card p-5 text-sm">
            <h2 className="font-bold">Nota fiscal · Bling</h2>
            {query.nfSolicitada && <p role="status" className="mt-2 rounded bg-emerald-50 p-2 text-emerald-800">Solicitação colocada na fila. Acompanhe o status abaixo.</p>}
            {query.nfErro && <p role="alert" className="mt-2 rounded bg-red-50 p-2 text-red-700">{query.nfErro}</p>}
            {invoice ? <>
              <p className="mt-3">Status: <strong>{({ QUEUED: 'Na fila', PROCESSING: 'Processando', GENERATED: 'Gerada; aguardando retorno da SEFAZ', AUTHORIZED: 'Autorizada', REJECTED: 'Rejeitada', FAILED: 'Com erro' } as Record<string, string>)[invoice.status] ?? invoice.status}</strong></p>
              {invoice.invoiceNumber && <p className="mt-1 text-slate-600">NF-e {invoice.invoiceNumber}{invoice.series ? ` · série ${invoice.series}` : ''}</p>}
              {invoice.accessKey && <p className="mt-1 break-all text-xs text-slate-500">Chave: {invoice.accessKey}</p>}
              {invoice.rejectionReason && <p className="mt-2 text-red-700">{invoice.rejectionReason}</p>}
              {invoice.authorizedAt && <p className="mt-2 text-xs text-slate-500">Autorizada em {formatDateTime(invoice.authorizedAt)}</p>}
            </> : <p className="mt-2 text-slate-500">Ainda não há solicitação de NF-e para este pedido.</p>}
            {(!invoice || ['FAILED', 'REJECTED'].includes(invoice.status)) && <form action={requestBlingInvoiceAction} className="mt-4"><input type="hidden" name="number" value={order.number} /><button className="button w-full">Solicitar NF-e no Bling</button></form>}
            <p className="mt-3 text-xs text-slate-500">Disponível após o pagamento confirmado e o pedido registrado no Bling. O ERP aplica a configuração fiscal da loja.</p>
          </section>
          <section className="card p-5 text-sm">
            <h2 className="font-bold">Cliente</h2>
            <p className="mt-2">{order.customer?.name}</p><p className="text-slate-500">{order.customer?.email}</p>
            {address && <><h3 className="mt-4 font-semibold">Entrega</h3><p className="text-slate-600">{address.street}, {address.number}{address.complement && ` – ${address.complement}`}<br />{address.district && `${address.district}, `}{address.city}/{address.state}<br />CEP {address.zipCode}</p></>}
          </section>
          <section className="card p-5 text-sm">
            <h2 className="font-bold">Pagamento</h2>
            {order.payments.map(payment => <div key={payment.id} className="mt-2"><p>{paymentMethodLabel[payment.method] ?? payment.method} · {paymentStatusLabel[payment.status] ?? payment.status}</p><p className="text-xs text-slate-400">{payment.provider === 'mercadopago' ? `Mercado Pago #${payment.transactionId}` : 'Confirmação manual'}</p>{payment.expiresAt && payment.status === 'PENDING' && <p className="text-xs text-slate-400">Vence em {formatDateTime(payment.expiresAt)}</p>}{payment.paidAt && <p className="text-xs text-slate-400">Pago em {formatDateTime(payment.paidAt)}</p>}</div>)}
          </section>
        </aside>
      </div>
    </>
  );
}
