'use client';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Header } from '../../components/header';
import { CardPayment, CardPaymentHandle } from '../../components/card-payment';
import { PixPayment } from '../../components/pix-payment';
import { ShippingOptions } from '../../components/shipping-options';
import { cartSubtotalCents, lineKey, useCart } from '../../lib/cart';
import { CartLines, hasStockIssues } from '../../components/cart/cart-lines';
import { useAvailability } from '../../lib/availability';
import { clearLocalDraft, confirmCustomer, DraftData, draftFromAccount, formatPhone, identifyCustomer, mergeAddress, readLocalDraft, saveDraft, writeLocalDraft } from '../../lib/checkout-draft';
import { track } from '../../lib/track';
import { CheckoutForm, CheckoutResult, PromotionPreview, captureCart, previewCoupon, previewPromotions, submitCheckout } from '../../lib/checkout';
import { formatPrice } from '../../lib/format';
import { formatCpf, getPaymentConfig, isValidCpf, PaymentConfig } from '../../lib/payment';
import { useStoreBrand } from '../../components/store-name';
import { signedInCustomerAction, type SignedInCustomer } from './actions';
import { formatCep, lookupCep, onlyDigits, quoteShipping, rememberCep, ShippingQuote } from '../../lib/shipping';

type Field = { name: keyof DraftData; label: string; required?: boolean; className?: string; pattern?: string; type?: string; autoComplete?: string; inputMode?: 'numeric' | 'tel' | 'email' };
const contactFields: Field[] = [
  { name: 'name', label: 'Nome completo', required: true, className: 'sm:col-span-2', autoComplete: 'name' },
  { name: 'email', label: 'E-mail', required: true, type: 'email', autoComplete: 'email', inputMode: 'email' },
  { name: 'phone', label: 'Celular / WhatsApp', type: 'tel', autoComplete: 'tel', inputMode: 'tel' },
];
const addressFields: Field[] = [
  { name: 'street', label: 'Rua', required: true, className: 'sm:col-span-2', autoComplete: 'address-line1' },
  { name: 'number', label: 'Número', required: true },
  { name: 'complement', label: 'Complemento', autoComplete: 'address-line2' },
  { name: 'district', label: 'Bairro' },
  { name: 'city', label: 'Cidade', required: true, autoComplete: 'address-level2' },
  { name: 'state', label: 'UF', required: true, pattern: '[A-Za-z]{2}', autoComplete: 'address-level1' },
];
const inputClass = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal read-only:bg-slate-50 read-only:text-slate-600';

function PaymentIcon({ kind }: { kind: 'pix' | 'card' | 'boleto' }) {
  if (kind === 'pix') return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true"><path d="m12 2.8 4.2 4.2L12 11.2 7.8 7 12 2.8Zm0 10 4.2 4.2-4.2 4.2-4.2-4.2 4.2-4.2ZM2.8 12l4.2-4.2L11.2 12 7 16.2 2.8 12Zm10 0L17 7.8l4.2 4.2-4.2 4.2-4.2-4.2Z" fill="currentColor" /></svg>;
  if (kind === 'card') return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M3 9h18M6 15h4" /></svg>;
  return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 4h16v16H4zM7 7v10m3-10v10m3-10v10m3-10v10m2-10v10" /></svg>;
}

export default function CheckoutPage() {
  const { slug } = useStoreBrand();
  const { items, clear, syncPrices } = useCart();
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [order, setOrder] = useState<CheckoutResult>();
  // Etapa 1: CPF. Etapa 2: cadastro e entrega (já preenchidos quando o cliente é reconhecido).
  const [step, setStep] = useState<'cpf' | 'form'>('cpf');
  const [identify, setIdentify] = useState<{ state: 'idle' | 'loading' } | { state: 'known'; maskedEmail: string } | { state: 'error'; message: string }>({ state: 'idle' });
  const [confirmEmail, setConfirmEmail] = useState('');
  const [confirmError, setConfirmError] = useState<string>();
  const [data, setData] = useState<DraftData>({});
  // Cliente com sessão em "Minha conta" pula CPF e confirmação de e-mail: os dados vêm direto da conta.
  const [account, setAccount] = useState<SignedInCustomer | null>(null);
  const [checkingAccount, setCheckingAccount] = useState(false);
  const [greeting, setGreeting] = useState<string>();
  const [cepLookup, setCepLookup] = useState<'idle' | 'loading' | 'success' | 'not-found'>('idle');
  const cepLookupId = useRef(0);
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
  const itemsKey = items.map(i => `${lineKey(i)}:${i.quantity}`).join(',');
  const cep = data.zipCode ?? '';
  const { availability, refresh: refreshStock } = useAvailability(slug, hydrated ? items : []);
  useEffect(() => { if (availability.size) syncPrices(new Map([...availability].map(([key, info]) => [key, info.price]))); }, [availability, syncPrices]);

  const startedCheckout = useRef(false);
  useEffect(() => {
    if (!hydrated || startedCheckout.current || !items.length) return;
    startedCheckout.current = true;
    track('begin_checkout', { value: items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0), items: items.map(i => ({ id: i.productId, name: i.name, price: Number(i.price), quantity: i.quantity })) });
  }, [hydrated, items]);

  useEffect(() => {
    setHydrated(true);
    // Volta ao checkout: o CPF e os dados digitados antes já aparecem.
    const local = readLocalDraft();
    if (local.cpf) setCpf(formatCpf(local.cpf));
    void getPaymentConfig().then(setPayConfig);
    if (document.cookie.split('; ').some(part => part === 'storeos_customer_in=1')) {
      setCheckingAccount(true);
      void signedInCustomerAction().then(customer => {
        if (!customer) return;
        setAccount(customer);
        const first = customer.name.trim().split(/\s+/)[0];
        if (customer.document && isValidCpf(customer.document)) {
          setCpf(formatCpf(customer.document));
          setGreeting(`Olá, ${first}! Você já entrou na sua conta, então trouxemos seus dados. Confira o endereço antes de pagar.`);
          const saved = readLocalDraft();
          openForm(draftFromAccount(customer, saved.cpf && onlyDigits(saved.cpf) === customer.document ? saved.data : {}));
        } else {
          setGreeting(`Olá, ${first}! Falta só o seu CPF para a nota fiscal.`);
        }
      }).finally(() => setCheckingAccount(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cada campo é gravado na hora (neste aparelho) e, logo depois, no servidor; assim o cliente pode voltar e continuar.
  useEffect(() => {
    if (step !== 'form') return;
    writeLocalDraft(cpf, data);
    const timer = window.setTimeout(() => void saveDraft(slug, cpf, data), 600);
    return () => window.clearTimeout(timer);
  }, [data, cpf, step, slug]);

  /** Cópia local só vale para o mesmo CPF: trocar de CPF começa um cadastro limpo. */
  const localFor = (value: string) => { const local = readLocalDraft(); return local.cpf && onlyDigits(local.cpf) === onlyDigits(value) ? local.data : {}; };
  const update = (field: keyof DraftData, value: string) => setData(current => ({ ...current, [field]: value }));

  /** Busca o endereço do CEP e completa só os campos vazios. */
  const fillFromCep = useCallback(async (value: string) => {
    const lookupId = ++cepLookupId.current;
    if (onlyDigits(value).length !== 8) { setCepLookup('idle'); return; }
    setCepLookup('loading');
    const address = await lookupCep(value);
    if (lookupId !== cepLookupId.current) return;
    if (!address) { setCepLookup('not-found'); return; }
    setData(current => mergeAddress(current, address));
    setCepLookup('success');
  }, []);

  /** Abre o cadastro: usa o CEP já calculado no carrinho e traz o endereço antes de o cliente digitar. */
  function openForm(initial: DraftData) {
    const zipCode = initial.zipCode || rememberCep();
    const next = { ...initial, ...(zipCode && { zipCode: formatCep(zipCode) }) };
    setData(next);
    setStep('form');
    if (next.zipCode && onlyDigits(next.zipCode).length === 8 && (!next.street || !next.city)) void fillFromCep(next.zipCode);
  }

  async function onIdentify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidCpf(cpf)) return;
    // Logado mas sem CPF salvo: não precisa confirmar e-mail, a sessão já prova quem é.
    if (account) { setGreeting('Pronto! Os dados da sua conta já estão preenchidos. Confira antes de pagar.'); openForm(draftFromAccount(account, localFor(cpf))); return; }
    setIdentify({ state: 'loading' });
    try {
      const result = await identifyCustomer(slug, cpf);
      if (result.status === 'draft') { setGreeting(result.data.name ? `Que bom te ver de novo, ${result.data.name.split(' ')[0]}! Seus dados foram recuperados.` : 'Recuperamos o que você já tinha preenchido.'); openForm(result.data); setIdentify({ state: 'idle' }); return; }
      if (result.status === 'known') { setIdentify({ state: 'known', maskedEmail: result.maskedEmail }); return; }
      setGreeting('Primeira compra por aqui? Preencha seu cadastro: tudo fica salvo enquanto você digita.');
      openForm(localFor(cpf));
      setIdentify({ state: 'idle' });
    } catch (e) {
      setIdentify({ state: 'error', message: e instanceof Error ? e.message : 'Não foi possível continuar agora.' });
    }
  }

  async function onConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfirmError(undefined);
    try {
      const result = await confirmCustomer(slug, cpf, confirmEmail);
      if (!result.matched) { setConfirmError('Este e-mail não confere com o cadastro. Confira ou continue sem carregar os dados.'); return; }
      setGreeting(result.data?.name ? `Olá, ${result.data.name.split(' ')[0]}! Carregamos seus dados. Confira antes de pagar.` : 'Carregamos seus dados. Confira antes de pagar.');
      openForm({ ...result.data });
      setIdentify({ state: 'idle' });
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : 'Não foi possível confirmar agora.');
    }
  }

  // Recalcula o frete quando o CEP fica completo ou o carrinho muda; o servidor recalcula de novo no pedido.
  const refreshQuote = useCallback(async (value: string) => {
    if (onlyDigits(value).length !== 8 || !items.length) return setQuote(undefined);
    setQuoteError(undefined);
    try {
      const next = await quoteShipping(slug, value, items);
      setQuote(next);
      setShippingRuleId(current => next.options.some(o => o.id === current) ? current : next.options[0]?.id);
      rememberCep(value);
    } catch (e) {
      setQuote(undefined);
      setQuoteError(e instanceof Error ? e.message : 'Não foi possível calcular o frete.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  useEffect(() => { if (step === 'form') void refreshQuote(cep); }, [cep, refreshQuote, step]);

  function onCepChange(value: string) {
    const formatted = formatCep(value);
    // CEP novo: o endereço anterior não vale mais, então a busca preenche tudo de novo.
    setData(current => ({ ...current, zipCode: formatted, ...(onlyDigits(formatted).length === 8 && onlyDigits(formatted) !== onlyDigits(current.zipCode ?? '') && { street: '', district: '', city: '', state: '' }) }));
    void fillFromCep(formatted);
  }

  const subtotal = cartSubtotalCents(items) / 100;
  const chosen = quote?.options.find(o => o.id === shippingRuleId);
  const shipping = chosen ? Number(chosen.price) : 0;
  const promoDiscount = promo ? Number(promo.discount) : 0;
  const discount = coupon?.discount ?? 0;
  const stockBlocked = hasStockIssues(items, availability);
  // O CPF é sempre pedido: vai na nota fiscal e no pedido registrado no ERP (e é exigido pelo Mercado Pago no cartão e no boleto).
  const blocked = Boolean(quote?.required && !quote.options.length) || !isValidCpf(cpf) || stockBlocked || step !== 'form';

  async function applyCoupon(code = couponInput) {
    if (!code.trim()) return;
    setCouponError(undefined);
    try {
      const result = await previewCoupon(slug, code, items, shipping);
      setCoupon({ code: result.code, discount: Number(result.discount) });
    } catch (e) {
      setCoupon(undefined);
      setCouponError(e instanceof Error ? e.message : 'Cupom inválido');
    }
  }

  useEffect(() => { if (items.length) void previewPromotions(slug, items).then(setPromo).catch(() => setPromo(undefined)); else setPromo(undefined); }, [itemsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Frete ou itens mudaram: recalcula o desconto do cupom já aplicado (frete grátis depende do frete).
  useEffect(() => { if (coupon) void applyCoupon(coupon.code); }, [shipping, itemsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      if (!isValidCpf(cpf)) throw new Error('Informe um CPF válido.');
      const form: CheckoutForm = { name: data.name ?? '', email: data.email ?? '', phone: data.phone ? onlyDigits(data.phone) : undefined, zipCode: cep, street: data.street ?? '', number: data.number ?? '', complement: data.complement, district: data.district, city: data.city ?? '', state: data.state ?? '', paymentMethod: method, cpf, shippingRuleId: quote?.required ? shippingRuleId : undefined, couponCode: coupon?.code };
      const card = method === 'CREDIT_CARD' ? await cardRef.current?.tokenize(cpf) : undefined;
      const placed = await submitCheckout(slug, form, items, card);
      setOrder(placed);
      // Conta o pedido feito (para PIX e boleto o pagamento vem depois), com o valor final cobrado.
      track('purchase', { value: Number(placed.total), transactionId: placed.number, items: items.map(i => ({ id: i.productId, name: i.name, price: Number(i.price), quantity: i.quantity })) });
      clearLocalDraft();
      clear();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir o pedido.');
      // O estoque pode ter mudado enquanto o cliente preenchia: atualiza as linhas para mostrar o saldo real.
      void refreshStock();
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
          <p className="mt-3 text-sm text-slate-500">Guarde o número do pedido: você acompanha a entrega em <Link href="/acompanhar" className="font-semibold text-brand">Acompanhar pedido</Link>.</p>
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
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
            <div className="grid h-fit gap-6">
              <ol className="flex items-center gap-3 text-sm" aria-label="Etapas">
                <li className={'flex items-center gap-2 font-semibold ' + (step === 'cpf' ? 'text-brand' : 'text-slate-500')}><span className={'grid h-7 w-7 place-items-center rounded-full text-xs ' + (step === 'cpf' ? 'bg-brand text-brand-fg' : 'bg-emerald-100 text-emerald-700')}>{step === 'cpf' ? '1' : '✓'}</span>Identificação</li>
                <li aria-hidden="true" className="h-px flex-1 bg-slate-200" />
                <li className={'flex items-center gap-2 font-semibold ' + (step === 'form' ? 'text-brand' : 'text-slate-400')}><span className={'grid h-7 w-7 place-items-center rounded-full text-xs ' + (step === 'form' ? 'bg-brand text-brand-fg' : 'bg-slate-100')}>2</span>Entrega e pagamento</li>
              </ol>

              {step === 'cpf' && checkingAccount ? (
                <section className="card p-6" aria-busy="true"><p className="text-sm text-slate-500">Carregando os dados da sua conta…</p></section>
              ) : step === 'cpf' ? (
                <section className="card p-6">
                  <h2 className="text-lg font-bold">Informe seu CPF para começar</h2>
                  {account ? <p className="mt-1 text-sm text-slate-500">{greeting}</p> : <p className="mt-1 text-sm text-slate-500">Se você já comprou aqui, recuperamos seus dados. Se for a primeira vez, abrimos o cadastro e salvamos tudo enquanto você preenche. Já tem conta? <Link href="/conta?voltar=checkout" className="font-medium text-brand underline">Entre</Link> e pule esta etapa.</p>}
                  <form onSubmit={onIdentify} className="mt-5 flex flex-wrap items-end gap-3">
                    <label className="text-sm font-medium">CPF
                      <input value={cpf} onChange={e => { setCpf(formatCpf(e.target.value)); setIdentify({ state: 'idle' }); }} inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" required autoFocus aria-invalid={cpf.length === 14 && !isValidCpf(cpf)} aria-describedby="cpf-help" className={inputClass + ' sm:w-56'} />
                    </label>
                    <button className="button disabled:opacity-60" disabled={!isValidCpf(cpf) || identify.state === 'loading'}>{identify.state === 'loading' ? 'Verificando…' : 'Continuar'}</button>
                    <span id="cpf-help" className="block w-full text-xs text-slate-500" aria-live="polite">{cpf.length === 14 && !isValidCpf(cpf) ? 'CPF inválido. Confira os números digitados.' : 'Usado no pedido e na nota fiscal.'}</span>
                  </form>
                  {identify.state === 'error' && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{identify.message}</p>}
                  {identify.state === 'known' && (
                    <form onSubmit={onConfirm} className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="font-semibold">Encontramos seu cadastro!</p>
                      <p className="mt-1 text-sm text-slate-600">Para sua segurança, confirme o e-mail cadastrado (<b>{identify.maskedEmail}</b>) e carregamos seu endereço.</p>
                      <div className="mt-3 flex flex-wrap items-end gap-3">
                        <label className="w-full text-sm font-medium sm:w-auto sm:min-w-0 sm:flex-1">E-mail<input type="email" required value={confirmEmail} onChange={e => setConfirmEmail(e.target.value)} autoComplete="email" inputMode="email" className={inputClass} /></label>
                        <button className="button">Carregar meus dados</button>
                      </div>
                      {confirmError && <p role="alert" className="mt-2 text-sm text-red-700">{confirmError}</p>}
                      <button type="button" onClick={() => { setGreeting(undefined); openForm(localFor(cpf)); setIdentify({ state: 'idle' }); }} className="mt-3 text-sm font-medium text-brand underline">Continuar sem carregar os dados</button>
                    </form>
                  )}
                </section>
              ) : (
                <form id="checkout-form" onSubmit={onSubmit} className="card grid gap-4 p-6 sm:grid-cols-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
                    <h2 className="text-lg font-bold">Seus dados</h2>
                    {account
                      ? <span className="text-sm text-slate-500">Conta {account.email} · CPF {cpf}</span>
                      : <span className="text-sm text-slate-500">CPF {cpf} · <button type="button" onClick={() => setStep('cpf')} className="font-medium text-brand underline">trocar</button></span>}
                  </div>
                  {greeting && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 sm:col-span-2">{greeting}</p>}
                  {contactFields.map(f => (
                    <label key={f.name} className={`text-sm font-medium ${f.className ?? ''}`}>{f.label}{!f.required && <span className="font-normal text-slate-400"> (opcional)</span>}
                      <input name={f.name} required={f.required} type={f.type ?? 'text'} inputMode={f.inputMode} autoComplete={f.autoComplete} readOnly={Boolean(account) && f.name === 'email'} value={data[f.name] ?? ''} onChange={e => update(f.name, f.name === 'phone' ? formatPhone(e.target.value) : e.target.value)} onBlur={f.name === 'email' ? () => void captureCart(slug, data.email ?? '', data.name ?? '', items) : undefined} className={inputClass} />
                      {f.name === 'email' && <span className="mt-1 block text-xs font-normal text-slate-500">{account ? 'E-mail da sua conta. A confirmação do pedido vai para ele.' : 'Enviamos a confirmação do pedido para este e-mail.'}</span>}
                    </label>
                  ))}
                  <h2 className="mt-2 text-lg font-bold sm:col-span-2">Entrega</h2>
                  <label className="text-sm font-medium">CEP
                    <input name="zipCode" required pattern={'\\d{5}-?\\d{3}'} inputMode="numeric" autoComplete="postal-code" value={cep} onChange={e => onCepChange(e.target.value)} placeholder="00000-000" aria-describedby="cep-help" className={inputClass} />
                  </label>
                  <p id="cep-help" className="self-end pb-2 text-xs text-slate-500" aria-live="polite">{cepLookup === 'loading' ? 'Buscando endereço pelo CEP…' : cepLookup === 'success' ? 'Endereço encontrado. Confira e informe o número.' : cepLookup === 'not-found' ? 'Não localizamos este CEP. Preencha o endereço manualmente.' : 'Com o CEP, buscamos rua, bairro, cidade e UF.'}</p>
                  {addressFields.map(f => (
                    <label key={f.name} className={`text-sm font-medium ${f.className ?? ''}`}>{f.label}
                      <input name={f.name} required={f.required} pattern={f.pattern} type="text" autoComplete={f.autoComplete} value={data[f.name] ?? ''} onChange={e => update(f.name, f.name === 'state' ? e.target.value.toUpperCase().slice(0, 2) : e.target.value)} className={inputClass} />
                    </label>
                  ))}
                  {!account && <p className="text-xs text-slate-500 sm:col-span-2">Tudo o que você preenche fica salvo: se precisar sair, é só voltar e informar o CPF.</p>}
                  <fieldset className="sm:col-span-2">
                    <legend className="mb-2 font-bold">Opções de entrega</legend>
                    {quote ? <ShippingOptions quote={quote} name="shippingRuleId" selected={shippingRuleId} onSelect={setShippingRuleId} /> : <p className="text-sm text-slate-500">{quoteError ?? 'Informe o CEP para ver as opções de entrega.'}</p>}
                  </fieldset>
                  <fieldset className="sm:col-span-2">
                    <legend className="mb-3 font-bold">Pagamento</legend>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm transition hover:border-slate-400 has-[:checked]:border-brand has-[:checked]:bg-brand/5 has-[:checked]:ring-1 has-[:checked]:ring-brand">
                        <input className="sr-only" type="radio" name="paymentMethod" value="PIX" checked={method === 'PIX'} onChange={() => setMethod('PIX')} />
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><PaymentIcon kind="pix" /></span><span><b className="block">PIX</b><span className="text-xs text-slate-500">Aprovação rápida</span></span>
                      </label>
                      {payConfig?.card && <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm transition hover:border-slate-400 has-[:checked]:border-brand has-[:checked]:bg-brand/5 has-[:checked]:ring-1 has-[:checked]:ring-brand">
                        <input className="sr-only" type="radio" name="paymentMethod" value="CREDIT_CARD" checked={method === 'CREDIT_CARD'} onChange={() => setMethod('CREDIT_CARD')} />
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700"><PaymentIcon kind="card" /></span><span><b className="block">Cartão de crédito</b><span className="text-xs text-slate-500">Parcelamento disponível</span></span>
                      </label>}
                      {payConfig?.boleto && <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm transition hover:border-slate-400 has-[:checked]:border-brand has-[:checked]:bg-brand/5 has-[:checked]:ring-1 has-[:checked]:ring-brand">
                        <input className="sr-only" type="radio" name="paymentMethod" value="BOLETO" checked={method === 'BOLETO'} onChange={() => setMethod('BOLETO')} />
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700"><PaymentIcon kind="boleto" /></span><span><b className="block">Boleto bancário</b><span className="text-xs text-slate-500">Compensação em até 2 dias úteis</span></span>
                      </label>}
                    </div>
                    {payConfig?.card && method === 'CREDIT_CARD' && <CardPayment ref={cardRef} config={payConfig.card} amount={subtotal - promoDiscount - discount + shipping} cpf={cpf} />}
                  </fieldset>
                </form>
              )}
            </div>
            <aside className="card h-fit p-6">
              <h2 className="font-bold">Resumo do pedido</h2>
              <CartLines items={items} availability={availability} compact />
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
              {stockBlocked && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Ajuste os itens marcados no resumo para continuar.</p>}
              <button form="checkout-form" className="button mt-6 w-full disabled:opacity-60" disabled={submitting || !hydrated || blocked}>{submitting ? 'Enviando…' : step === 'cpf' ? 'Informe o CPF para continuar' : 'Confirmar pedido'}</button>
            </aside>
          </div>
        )}
      </main>
    </>
  );
}
