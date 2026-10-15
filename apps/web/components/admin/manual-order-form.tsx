'use client';
import { useState, useTransition } from 'react';
import { createManualOrderAction, type ManualOrderLine } from '../../app/admin/actions';
import type { AdminProduct } from '../../lib/admin/types';
import { formatPrice } from '../../lib/format';

type Line = { key: number; productId: string; variantId: string; quantity: string; unitPrice: string };
const label = (attributes: { value: string }[]) => attributes.map(a => a.value).join(' / ');
const toNumber = (value: string) => Number(value.replace(',', '.')) || 0;

/** Venda por WhatsApp, telefone ou balcão: escolhe produtos, ajusta preço, frete e desconto, e diz se já foi paga. */
export function ManualOrderForm({ products }: { products: AdminProduct[] }) {
  const [lines, setLines] = useState<Line[]>([{ key: 1, productId: '', variantId: '', quantity: '1', unitPrice: '' }]);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [discount, setDiscount] = useState('');
  const [shipping, setShipping] = useState('');
  const byId = new Map(products.map(product => [product.id, product]));
  const priceOf = (line: Line) => {
    const product = byId.get(line.productId);
    const variant = product?.variants?.find(v => v.id === line.variantId);
    return variant?.price ?? product?.price ?? '0';
  };
  const unit = (line: Line) => line.unitPrice.trim() ? toNumber(line.unitPrice) : Number(priceOf(line));
  const subtotal = lines.reduce((sum, line) => sum + (line.productId ? unit(line) * (Number(line.quantity) || 0) : 0), 0);
  const total = subtotal - toNumber(discount) + toNumber(shipping);
  const update = (key: number, patch: Partial<Line>) => setLines(current => current.map(line => line.key === key ? { ...line, ...patch } : line));

  const submit = (form: FormData) => {
    setError(undefined);
    const text = (name: string) => String(form.get(name) ?? '').trim() || undefined;
    const items: ManualOrderLine[] = lines.filter(line => line.productId).map(line => ({ productId: line.productId, ...(line.variantId && { variantId: line.variantId }), quantity: Number(line.quantity) || 0, ...(line.unitPrice.trim() && { unitPrice: line.unitPrice.trim() }) }));
    if (!items.length) { setError('Adicione ao menos um produto.'); return; }
    const zip = text('zipCode');
    start(async () => {
      const result = await createManualOrderAction({
        customer: { name: String(form.get('name') ?? '').trim(), email: String(form.get('email') ?? '').trim(), phone: text('phone'), document: text('document') },
        ...(zip && { shippingAddress: { zipCode: zip, street: text('street') ?? '', number: text('number') ?? '', complement: text('complement'), district: text('district'), city: text('city') ?? '', state: text('state') ?? '' } }),
        items, paymentMethod: (text('paymentMethod') as 'PIX' | 'BOLETO' | 'CREDIT_CARD') ?? 'PIX', paid: form.get('paid') === 'on',
        discount: discount.trim() || undefined, shipping: shipping.trim() || undefined, shippingMethod: text('shippingMethod'), note: text('note'),
      });
      if (result?.error) setError(result.error);
    });
  };

  return (
    <form action={submit} className="mt-6 space-y-6">
      <section className="card p-5">
        <h2 className="font-bold">Cliente</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Nome<input name="name" required maxLength={120} className="input" /></label>
          <label className="text-sm font-medium">E-mail<input name="email" type="email" required maxLength={200} className="input" /></label>
          <label className="text-sm font-medium">Telefone / WhatsApp<input name="phone" maxLength={30} className="input" /></label>
          <label className="text-sm font-medium">CPF ou CNPJ (para a nota fiscal)<input name="document" maxLength={20} inputMode="numeric" className="input" /></label>
        </div>
      </section>
      <section className="card p-5">
        <h2 className="font-bold">Itens</h2>
        <div className="mt-3 space-y-3">
          {lines.map(line => {
            const product = byId.get(line.productId);
            return <div key={line.key} className="grid gap-2 sm:grid-cols-[1fr_160px_90px_120px_auto]">
              <select aria-label="Produto" value={line.productId} onChange={event => update(line.key, { productId: event.target.value, variantId: '', unitPrice: '' })} className="input mt-0">
                <option value="">Escolha um produto…</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} · {formatPrice(p.price)}{p.variants?.length ? '' : ` · estoque ${p.stock - p.reserved}`}</option>)}
              </select>
              {product?.variants?.length
                ? <select aria-label="Variação" value={line.variantId} onChange={event => update(line.key, { variantId: event.target.value })} className="input mt-0" required><option value="">Variação…</option>{product.variants.filter(v => v.active).map(v => <option key={v.id} value={v.id}>{label(v.attributes)} · {v.stock - v.reserved}</option>)}</select>
                : <span />}
              <input aria-label="Quantidade" type="number" min={1} max={999} value={line.quantity} onChange={event => update(line.key, { quantity: event.target.value })} className="input mt-0" />
              <input aria-label="Preço unitário combinado" inputMode="decimal" placeholder={line.productId ? Number(priceOf(line)).toFixed(2) : 'Preço'} value={line.unitPrice} onChange={event => update(line.key, { unitPrice: event.target.value })} className="input mt-0" />
              <button type="button" className="button-ghost" onClick={() => setLines(current => current.length > 1 ? current.filter(l => l.key !== line.key) : current)} aria-label="Remover linha">✕</button>
            </div>;
          })}
        </div>
        <button type="button" className="button-ghost mt-3" onClick={() => setLines(current => [...current, { key: Math.max(...current.map(l => l.key)) + 1, productId: '', variantId: '', quantity: '1', unitPrice: '' }])}>+ Adicionar item</button>
        <p className="mt-3 text-xs text-slate-500">Deixe o preço vazio para usar o do catálogo. Preço ajustado fica registrado no histórico do pedido. Cada produto só pode aparecer em uma linha.</p>
      </section>
      <section className="card p-5">
        <h2 className="font-bold">Entrega e pagamento</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Frete combinado (R$)<input value={shipping} onChange={event => setShipping(event.target.value)} inputMode="decimal" className="input" /></label>
          <label className="text-sm font-medium">Forma de entrega<input name="shippingMethod" maxLength={80} placeholder="Motoboy, retirada, Correios…" className="input" /></label>
          <label className="text-sm font-medium">Desconto (R$)<input value={discount} onChange={event => setDiscount(event.target.value)} inputMode="decimal" className="input" /></label>
          <label className="text-sm font-medium">Forma de pagamento
            <select name="paymentMethod" defaultValue="PIX" className="input"><option value="PIX">PIX</option><option value="BOLETO">Boleto</option><option value="CREDIT_CARD">Cartão</option></select>
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" name="paid" /> Já recebi o pagamento (o pedido entra como pago e baixa o estoque)</label>
        <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Endereço de entrega (opcional)</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-medium">CEP<input name="zipCode" maxLength={9} className="input" /></label>
            <label className="text-sm font-medium sm:col-span-2">Rua<input name="street" maxLength={160} className="input" /></label>
            <label className="text-sm font-medium">Número<input name="number" maxLength={20} className="input" /></label>
            <label className="text-sm font-medium">Complemento<input name="complement" maxLength={80} className="input" /></label>
            <label className="text-sm font-medium">Bairro<input name="district" maxLength={80} className="input" /></label>
            <label className="text-sm font-medium sm:col-span-2">Cidade<input name="city" maxLength={80} className="input" /></label>
            <label className="text-sm font-medium">UF<input name="state" maxLength={2} className="input" /></label>
          </div>
        </details>
        <label className="mt-4 block text-sm font-medium">Observação interna (aparece no histórico)<input name="note" maxLength={280} className="input" /></label>
      </section>
      <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <p className="text-sm text-slate-600">Itens {formatPrice(subtotal)} · total <strong className="text-lg text-slate-900">{formatPrice(Math.max(total, 0))}</strong></p>
        <button className="button disabled:opacity-60" disabled={pending}>{pending ? 'Criando…' : 'Criar pedido'}</button>
      </section>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </form>
  );
}
