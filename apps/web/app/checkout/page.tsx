'use client';
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { Header } from '../../components/header';
import { PixPayment } from '../../components/pix-payment';
import { cartSubtotalCents, useCart } from '../../lib/cart';
import { CheckoutForm, CheckoutResult, submitCheckout } from '../../lib/checkout';
import { formatPrice } from '../../lib/format';

const fields: { name: keyof CheckoutForm; label: string; required?: boolean; className?: string; pattern?: string; type?: string; autoComplete?: string }[] = [
  { name: 'name', label: 'Nome completo', required: true, className: 'sm:col-span-2', autoComplete: 'name' },
  { name: 'email', label: 'E-mail', required: true, className: 'sm:col-span-2', type: 'email', autoComplete: 'email' },
  { name: 'zipCode', label: 'CEP', required: true, pattern: '\\d{5}-?\\d{3}', autoComplete: 'postal-code' },
  { name: 'street', label: 'Rua', required: true, autoComplete: 'address-line1' },
  { name: 'number', label: 'Número', required: true },
  { name: 'complement', label: 'Complemento', autoComplete: 'address-line2' },
  { name: 'district', label: 'Bairro' },
  { name: 'city', label: 'Cidade', required: true, autoComplete: 'address-level2' },
  { name: 'state', label: 'UF', required: true, pattern: '[A-Za-z]{2}', autoComplete: 'address-level1' },
];

export default function CheckoutPage() {
  const { items, clear } = useCart();
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [order, setOrder] = useState<CheckoutResult>();
  useEffect(() => setHydrated(true), []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      const form = Object.fromEntries(new FormData(event.currentTarget)) as unknown as CheckoutForm;
      setOrder(await submitCheckout(form, items));
      clear();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir o pedido.');
    } finally {
      setSubmitting(false);
    }
  }

  if (order) return (
    <>
      <Header />
      <main className="shell py-14">
        <div className="card mx-auto max-w-2xl p-8">
          <p className="text-sm font-semibold text-brand">PEDIDO RECEBIDO</p>
          <h1 className="mt-1 text-3xl font-bold">Obrigado! Seu pedido é o {order.number}</h1>
          <p className="mt-4 rounded-xl bg-violet-50 p-4 text-slate-700">{order.payment.instructions.message}</p>
          {order.payment.instructions.pixCode && <PixPayment pixCode={order.payment.instructions.pixCode} qrCodeBase64={order.payment.instructions.qrCodeBase64} expiresAt={order.payment.expiresAt} />}
          <ul className="mt-6 divide-y text-sm">{order.items.map(i => <li key={i.sku} className="flex justify-between py-2"><span>{i.quantity}× {i.name}</span><span>{formatPrice(i.total)}</span></li>)}</ul>
          <div className="mt-4 flex justify-between border-t pt-4 text-lg"><span>Total</span><b>{formatPrice(order.total)}</b></div>
          <Link href="/categorias" className="button mt-8">Continuar comprando</Link>
        </div>
      </main>
    </>
  );

  return (
    <>
      <Header />
      <main className="shell py-14">
        <h1 className="text-3xl font-bold">Finalizar compra</h1>
        {hydrated && !items.length ? (
          <div className="card mt-8 p-10 text-center text-slate-500">Seu carrinho está vazio. <Link href="/categorias" className="font-medium text-brand">Ver produtos</Link></div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
            <div className="card grid gap-4 p-6 sm:grid-cols-2">
              <h2 className="font-bold sm:col-span-2">Dados e entrega</h2>
              {fields.map(f => (
                <label key={f.name} className={`text-sm font-medium ${f.className ?? ''}`}>{f.label}
                  <input name={f.name} required={f.required} pattern={f.pattern} type={f.type ?? 'text'} autoComplete={f.autoComplete} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal" />
                </label>
              ))}
              <fieldset className="sm:col-span-2">
                <legend className="mb-2 font-bold">Pagamento</legend>
                <label className="mr-6"><input type="radio" name="paymentMethod" value="PIX" defaultChecked /> PIX</label>
                <label><input type="radio" name="paymentMethod" value="BOLETO" /> Boleto</label>
              </fieldset>
            </div>
            <aside className="card h-fit p-6">
              <ul className="divide-y text-sm">{items.map(i => <li key={i.productId} className="flex justify-between py-2"><span>{i.quantity}× {i.name}</span><span>{formatPrice((Number(i.price) * 100 * i.quantity) / 100)}</span></li>)}</ul>
              <div className="mt-4 flex justify-between border-t pt-4"><span>Total</span><b>{formatPrice(cartSubtotalCents(items) / 100)}</b></div>
              {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              <button className="button mt-6 w-full disabled:opacity-60" disabled={submitting || !hydrated}>{submitting ? 'Enviando…' : 'Confirmar pedido'}</button>
            </aside>
          </form>
        )}
      </main>
    </>
  );
}
