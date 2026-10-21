import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Header } from '../../../../components/header';
import { PixPayment } from '../../../../components/pix-payment';
import { accountFetch, hasCustomerSession } from '../../../../lib/account/session';
import { addressLines, formatDate, PAYMENT_LABEL, statusTone, type AccountOrder } from '../../../../lib/account/types';
import { formatPrice } from '../../../../lib/format';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Meu pedido', robots: { index: false } };

/** Etapas mostradas na linha do tempo; as já registradas aparecem com data. */
const STEPS = [
  { status: 'AWAITING_PAYMENT', label: 'Pedido recebido' },
  { status: 'PAID', label: 'Pagamento aprovado' },
  { status: 'PICKING', label: 'Em separação' },
  { status: 'SHIPPED', label: 'Enviado' },
  { status: 'DELIVERED', label: 'Entregue' },
];

export default async function AccountOrderPage({ params }: { params: Promise<{ number: string }> }) {
  if (!(await hasCustomerSession())) redirect('/conta');
  const { number } = await params;
  const order = await accountFetch<AccountOrder>(`/orders/${encodeURIComponent(decodeURIComponent(number))}`);
  if (!order) notFound();

  const reached = new Map(order.timeline.map(entry => [entry.status, entry.at]));
  const ended = ['CANCELLED', 'REFUNDED', 'RETURNED'].includes(order.status);
  const instructions = order.payment?.instructions;
  return <>
    <Header />
    <main className="shell py-8 sm:py-12">
      <Link href="/conta" className="text-sm font-medium text-slate-500 hover:text-slate-900">‹ Meus pedidos</Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Pedido {order.number}</h1>
          <p className="text-sm text-slate-500">Feito em {formatDate(order.createdAt, true)}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ${statusTone(order.status)}`}>{order.statusLabel}</span>
      </div>

      {ended ? <p className="card mt-6 p-4 text-sm text-slate-600">Este pedido foi {order.statusLabel.toLowerCase()}. {order.status === 'REFUNDED' ? 'O valor volta pelo mesmo meio de pagamento.' : ''}</p> : (
        <ol className="card mt-6 grid gap-4 p-5 sm:grid-cols-5 sm:gap-2" aria-label="Andamento do pedido">
          {STEPS.map((step, index) => {
            const at = reached.get(step.status) ?? (step.status === 'AWAITING_PAYMENT' ? order.createdAt : undefined);
            return <li key={step.status} className="flex items-center gap-3 sm:flex-col sm:text-center">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${at ? 'bg-brand text-brand-fg' : 'bg-slate-100 text-slate-400'}`}>{at ? '✓' : index + 1}</span>
              <span className="text-sm"><span className={at ? 'font-semibold' : 'text-slate-500'}>{step.label}</span>{at && <span className="block text-xs text-slate-500">{formatDate(at, true)}</span>}</span>
            </li>;
          })}
        </ol>
      )}

      {instructions && <section className="card mt-6 p-5" aria-labelledby="pagar">
        <h2 id="pagar" className="text-lg font-bold">Falta pagar</h2>
        {instructions.message && <p className="mt-2 text-sm text-slate-600">{instructions.message}</p>}
        {instructions.pixCode && <PixPayment pixCode={instructions.pixCode} qrCodeBase64={instructions.qrCodeBase64} expiresAt={order.payment?.expiresAt ?? undefined} />}
        {instructions.ticketUrl && !instructions.pixCode && <div className="mt-4">
          <a href={instructions.ticketUrl} target="_blank" rel="noopener noreferrer" className="button">Abrir boleto</a>
          {instructions.barcode && <label className="mt-4 block text-sm font-medium">Linha digitável<textarea readOnly value={instructions.barcode} rows={2} className="mt-1 w-full resize-none rounded-xl border border-slate-300 bg-slate-50 p-3 font-mono text-xs" /></label>}
        </div>}
      </section>}

      {order.tracking && <section className="card mt-6 p-5" aria-labelledby="entrega">
        <h2 id="entrega" className="text-lg font-bold">Entrega</h2>
        <p className="mt-2 text-sm">Enviado{order.tracking.carrier ? ` por ${order.tracking.carrier}` : ''}{order.tracking.shippedAt ? ` em ${formatDate(order.tracking.shippedAt)}` : ''}. Código de rastreio: <strong className="font-mono">{order.tracking.code}</strong></p>
        {order.tracking.url && <a href={order.tracking.url} target="_blank" rel="noopener noreferrer" className="button mt-4">Rastrear entrega</a>}
      </section>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="card p-5" aria-labelledby="itens">
          <h2 id="itens" className="text-lg font-bold">Itens</h2>
          <ul className="mt-3 divide-y">
            {order.items.map(item => <li key={item.sku} className="flex items-center gap-4 py-3">
              {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg bg-white object-contain object-center" /> : <span aria-hidden className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">✦</span>}
              <div className="min-w-0 flex-1">
                {item.productSlug ? <Link href={`/produto/${item.productSlug}`} className="font-medium hover:text-brand">{item.name}</Link> : <p className="font-medium">{item.name}</p>}
                <p className="text-sm text-slate-500">{item.quantity} × {formatPrice(item.unitPrice)}</p>
              </div>
              <b className="shrink-0 text-sm">{formatPrice(item.total)}</b>
            </li>)}
          </ul>
          <dl className="mt-3 grid gap-2 border-t pt-4 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>{formatPrice(order.subtotal)}</dd></div>
            {Number(order.discount) > 0 && <div className="flex justify-between text-emerald-700"><dt>Descontos{order.couponCode ? ` (cupom ${order.couponCode})` : ''}</dt><dd>− {formatPrice(order.discount)}</dd></div>}
            <div className="flex justify-between"><dt className="text-slate-500">Frete{order.shippingMethod ? ` (${order.shippingMethod})` : ''}</dt><dd>{Number(order.shipping) ? formatPrice(order.shipping) : 'Grátis'}</dd></div>
            <div className="flex justify-between border-t pt-2 text-base"><dt className="font-semibold">Total</dt><dd className="font-bold">{formatPrice(order.total)}</dd></div>
          </dl>
        </section>
        <aside className="grid content-start gap-6">
          {order.payment && <section className="card p-5" aria-labelledby="pagamento">
            <h2 id="pagamento" className="text-lg font-bold">Pagamento</h2>
            <p className="mt-2 text-sm">{PAYMENT_LABEL[order.payment.method] ?? order.payment.method}{order.payment.paidAt ? `, aprovado em ${formatDate(order.payment.paidAt, true)}` : ''}</p>
          </section>}
          {addressLines(order.address).length > 0 && <section className="card p-5" aria-labelledby="endereco">
            <h2 id="endereco" className="text-lg font-bold">Endereço de entrega</h2>
            <address className="mt-2 text-sm not-italic text-slate-700">{addressLines(order.address).map(line => <span key={line} className="block">{line}</span>)}</address>
          </section>}
          {order.invoice && <section className="card p-5" aria-labelledby="nota">
            <h2 id="nota" className="text-lg font-bold">Nota fiscal</h2>
            <p className="mt-2 text-sm">Número {order.invoice.number}</p>
            {order.invoice.key && <p className="mt-1 break-all font-mono text-xs text-slate-500">{order.invoice.key}</p>}
          </section>}
          <p className="text-sm text-slate-500">Alguma dúvida sobre o pedido? Fale com a loja pelo WhatsApp ou e-mail informando o número {order.number}.</p>
        </aside>
      </div>
    </main>
  </>;
}
