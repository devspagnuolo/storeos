'use client';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Header } from '../../components/header';
import { CardPayment, CardPaymentHandle } from '../../components/card-payment';
import { PixPayment } from '../../components/pix-payment';
import { ShippingOptions } from '../../components/shipping-options';
import { cartSubtotalCents, lineKey, useCart } from '../../lib/cart';
import { CheckoutForm, CheckoutResult, PromotionPreview, previewCoupon, previewPromotions, submitCheckout } from '../../lib/checkout';
import { formatPrice } from '../../lib/format';
import { formatCpf, getPaymentConfig, isValidCpf, PaymentConfig } from '../../lib/payment';
import { formatCep, lookupCep, onlyDigits, quoteShipping, rememberCep, ShippingQuote } from '../../lib/shipping';

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
  const [cep, setCep] = useState('');
  const [quote, setQuote] = useState<ShippingQuote>();
  const [quoteError, setQuoteError] = useState<string>();
  const [shippingRuleId, setShippingRuleId] = useState<string>();
  const [promo, setPromo] = useState<PromotionPreview>();
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discount: number }>();
  const [couponError, setCouponError] = useState<string>();
  const [method, setMethod] = useState<CheckoutForm['paymentMethod']>('PIX');
  const [cpf, setCpf] = useState('');
  const [payConfig, setPayConfig] = useState<PaymentConfig>();
  const cardRef = useRef<CardPaymentHandle>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const itemsKey = items.map(i => `${lineKey(i)}:${i.quantity}`).join(',');

  useEffect(() => {
    setHydrated(true);
    setCep(rememberCep());
    void getPaymentConfig().then(setPayConfig);
  }, []);

  // Recalcula o frete quando o CEP fica completo ou o carrinho muda; o servidor recalcula de novo no pedido.
  const refreshQuote = useCallback(async (value: string) => {
    if (onlyDigits(value).length !== 8 || !items.length) return setQuote(undefined);
    setQuoteError(undefined);
    try {
      const next = await quoteShipping(value, items);
      setQuote(next);
      setShippingRuleId(current => next.options.some(o => o.id === current) ? current : next.options[0]?.id);
      rememberCep(value);
    } catch (e) {
      setQuote(undefined);
      setQuoteError(e instanceof Error ? e.message : 'Não foi possível calcular o frete.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  useEffect(() => { void refreshQuote(cep); }, [cep, refreshQuote]);

  async function onCepChange(value: string) {
    const formatted = formatCep(value);
    setCep(formatted);
    if (onlyDigits(formatted).length !== 8) return;
    const address = await lookupCep(formatted);
    const form = formRef.current;
    if (!address || !form) return;
    for (const [field, fieldValue] of Object.entries(address)) {
      const input = form.elements.namedItem(field) as HTMLInputElement | null;
      if (input && fieldValue) input.value = fieldValue;
    }
  }

  const subtotal = cartSubtotalCents(items) / 100;
  const chosen = quote?.options.find(o => o.id === shippingRuleId);
  const shipping = chosen ? Number(chosen.price) : 0;
  const promoDiscount = promo ? Number(promo.discount) : 0;
  const discount = coupon?.discount ?? 0;
  // O Mercado Pago exige o CPF no cartão e no boleto; a Rede não pede.
  const needsCpf = (method === 'BOLETO' && Boolean(payConfig?.boleto)) || (method === 'CREDIT_CARD' && payConfig?.card?.provider === 'mercadopago');
  const blocked = Boolean(quote?.required && !quote.options.length);

  async function applyCoupon(code = couponInput) {
    if (!code.trim()) return;
    setCouponError(undefined);
    try {
      const result = await previewCoupon(code, items, shipping);
      setCoupon({ code: result.code, discount: Number(result.discount) });
    } catch (e) {
      setCoupon(undefined);
      setCouponError(e instanceof Error ? e.message : 'Cupom inválido');
    }
  }

  useEffect(() => { if (items.length) void previewPromotions(items).then(setPromo).catch(() => setPromo(undefined)); else setPromo(undefined); }, [itemsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Frete ou itens mudaram: recalcula o desconto do cupom já aplicado (frete grátis depende do frete).
  useEffect(() => { if (coupon) void applyCoupon(coupon.code); }, [shipping, itemsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      const form = Object.fromEntries(new FormData(event.currentTarget)) as unknown as CheckoutForm;
      if (needsCpf && !isValidCpf(cpf)) throw new Error('Informe um CPF válido.');
      const card = method === 'CREDIT_CARD' ? await cardRef.current?.tokenize(cpf) : undefined;
      setOrder(await submitCheckout({ ...form, paymentMethod: method, cpf: needsCpf ? cpf : undefined, shippingRuleId: quote?.required ? shippingRuleId : undefined, couponCode: coupon?.code }, items, card));
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
          {order.payment.instructions.ticketUrl && !order.payment.instructions.pixCode && (
            <div className="mt-6 rounded-xl border border-slate-200 p-6 text-center">
              <a href={order.payment.instructions.ticketUrl} target="_blank" rel="noopener noreferrer" className="button">Abrir boleto</a>
              {order.payment.instructions.barcode && <label className="mt-4 block text-left text-sm font-medium">Linha digitável<textarea readOnly value={order.payment.instructions.barcode} rows={2} className="mt-1 w-full resize-none rounded-xl border border-slate-300 bg-slate-50 p-3 font-mono text-xs" /></label>}
            </div>
          )}
          {order.payment.instructions.pixCode && <PixPayment pixCode={order.payment.instructions.pixCode} qrCodeBase64={order.payment.instructions.qrCodeBase64} expiresAt={order.payment.expiresAt} />}
          <ul className="mt-6 divide-y text-sm">{order.items.map(i => <li key={i.sku} className="flex justify-between py-2"><span>{i.quantity}× {i.name}</span><span>{formatPrice(i.total)}</span></li>)}</ul>
          {order.promotions?.map(p => <div key={p.name} className="mt-4 flex justify-between border-t pt-4 text-sm text-emerald-700"><span>{p.name}</span><span>− {formatPrice(p.amount)}</span></div>)}
          {Number(order.discount) > 0 && <div className="mt-4 flex justify-between border-t pt-4 text-sm text-emerald-700"><span>Cupom {order.couponCode}</span><span>− {formatPrice(order.discount)}</span></div>}
          {order.shippingMethod && <div className="mt-4 flex justify-between border-t pt-4 text-sm"><span>Frete ({order.shippingMethod})</span><span>{Number(order.shipping) ? formatPrice(order.shipping) : 'Grátis'}</span></div>}
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
          <form ref={formRef} onSubmit={onSubmit} className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
            <div className="card grid gap-4 p-6 sm:grid-cols-2">
              <h2 className="font-bold sm:col-span-2">Dados e entrega</h2>
              {fields.map(f => (
                <label key={f.name} className={`text-sm font-medium ${f.className ?? ''}`}>{f.label}
                  {f.name === 'zipCode'
                    ? <input name="zipCode" required pattern={f.pattern} inputMode="numeric" autoComplete={f.autoComplete} value={cep} onChange={e => void onCepChange(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal" />
                    : <input name={f.name} required={f.required} pattern={f.pattern} type={f.type ?? 'text'} autoComplete={f.autoComplete} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal" />}
                </label>
              ))}
              <fieldset className="sm:col-span-2">
                <legend className="mb-2 font-bold">Entrega</legend>
                {quote ? <ShippingOptions quote={quote} name="shippingRuleId" selected={shippingRuleId} onSelect={setShippingRuleId} /> : <p className="text-sm text-slate-500">{quoteError ?? 'Informe o CEP para ver as opções de entrega.'}</p>}
              </fieldset>
              <fieldset className="sm:col-span-2">
                <legend className="mb-2 font-bold">Pagamento</legend>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <label><input type="radio" name="paymentMethod" value="PIX" checked={method === 'PIX'} onChange={() => setMethod('PIX')} /> PIX</label>
                  {payConfig?.card && <label><input type="radio" name="paymentMethod" value="CREDIT_CARD" checked={method === 'CREDIT_CARD'} onChange={() => setMethod('CREDIT_CARD')} /> Cartão de crédito</label>}
                  {payConfig?.boleto && <label><input type="radio" name="paymentMethod" value="BOLETO" checked={method === 'BOLETO'} onChange={() => setMethod('BOLETO')} /> Boleto</label>}
                </div>
                {needsCpf && (
                  <label className="mt-3 block text-sm font-medium">CPF do titular
                    <input value={cpf} onChange={e => setCpf(formatCpf(e.target.value))} inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" required className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal sm:max-w-xs" />
                  </label>
                )}
                {payConfig?.card && method === 'CREDIT_CARD' && <CardPayment ref={cardRef} config={payConfig.card} amount={subtotal - promoDiscount - discount + shipping} cpf={cpf} />}
              </fieldset>
            </div>
            <aside className="card h-fit p-6">
              <ul className="divide-y text-sm">{items.map(i => <li key={lineKey(i)} className="flex justify-between py-2"><span>{i.quantity}× {i.name}{i.variantLabel && <span className="text-slate-500"> ({i.variantLabel})</span>}</span><span>{formatPrice((Number(i.price) * 100 * i.quantity) / 100)}</span></li>)}</ul>
              <div className="mt-4 flex justify-between border-t pt-4 text-sm"><span>Subtotal</span><span>{formatPrice(subtotal)}</span></div>
              {promo?.applied.map(p => <div key={p.id} className="mt-2 flex justify-between text-sm text-emerald-700"><span>{p.name}</span><span>− {formatPrice(p.amount)}</span></div>)}
              <div className="mt-2 flex justify-between text-sm"><span>Frete</span><span>{!quote?.required ? (quote ? 'A combinar' : '—') : !chosen ? '—' : chosen.free ? 'Grátis' : formatPrice(chosen.price)}</span></div>
              <div className="mt-4 border-t pt-4">
                <div className="flex gap-2"><input value={couponInput} onChange={e => setCouponInput(e.target.value)} placeholder="Cupom de desconto" aria-label="Cupom de desconto" maxLength={32} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm uppercase" /><button type="button" onClick={() => void applyCoupon()} className="button-ghost text-sm">Aplicar</button></div>
                {couponError && <p role="alert" className="mt-2 text-xs text-red-700">{couponError}</p>}
              </div>
              {coupon && <div className="mt-3 flex justify-between text-sm text-emerald-700"><span>Cupom {coupon.code} <button type="button" onClick={() => { setCoupon(undefined); setCouponInput(''); }} className="underline">remover</button></span><span>− {formatPrice(coupon.discount)}</span></div>}
              <div className="mt-4 flex justify-between border-t pt-4"><span>Total</span><b>{formatPrice(subtotal - promoDiscount - discount + shipping)}</b></div>
              {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              <button className="button mt-6 w-full disabled:opacity-60" disabled={submitting || !hydrated || blocked}>{submitting ? 'Enviando…' : 'Confirmar pedido'}</button>
            </aside>
          </form>
        )}
      </main>
    </>
  );
}
