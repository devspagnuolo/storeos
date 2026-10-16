'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Header } from '../header';
import { CartLines, hasStockIssues } from './cart-lines';
import { CartSuggestions } from './cart-suggestions';
import { ShippingCalculator } from '../shipping-calculator';
import { useStoreBrand } from '../store-name';
import { useAvailability } from '../../lib/availability';
import { cartSubtotalCents, useCart } from '../../lib/cart';
import { formatPrice } from '../../lib/format';

/** Carrinho (cliente). Textos e a calculadora de frete podem vir do tema; valores e regras de compra nunca. */
export function CartPageView({ heading = 'Seu carrinho', buttonLabel = 'Finalizar compra', showShipping = true }: { heading?: string; buttonLabel?: string; showShipping?: boolean }) {
  const { slug } = useStoreBrand();
  const { items, syncPrices } = useCart();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const { availability } = useAvailability(slug, hydrated ? items : []);
  // Preço mudou na loja (promoção, reajuste): o carrinho passa a mostrar o valor que será cobrado.
  useEffect(() => { if (availability.size) syncPrices(new Map([...availability].map(([key, info]) => [key, info.price]))); }, [availability, syncPrices]);
  const subtotal = cartSubtotalCents(items) / 100;
  const blocked = hasStockIssues(items, availability);
  return (
    <>
      <Header />
      <main className="shell py-14">
        <h1 className="text-3xl font-bold">{heading}</h1>
        {!hydrated ? null : !items.length ? (
          <div className="card mt-8 p-10 text-center text-slate-500">Seu carrinho está vazio. <Link href="/categorias" className="font-medium text-brand">Ver produtos</Link></div>
        ) : (
          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <CartLines items={items} availability={availability} />
            <aside className="card h-fit p-6">
              <div className="flex justify-between"><span>Subtotal</span><b>{formatPrice(subtotal)}</b></div>
              {showShipping && <ShippingCalculator items={items} />}
              {blocked
                ? <><p role="alert" className="mt-6 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Ajuste os itens marcados para continuar.</p><button type="button" disabled className="button mt-3 w-full opacity-60">{buttonLabel}</button></>
                : <Link href="/checkout" className="button mt-6 w-full">{buttonLabel}</Link>}
              {/* O carrinho fica salvo neste navegador: voltar para a loja não apaga nada. */}
              <Link href="/" className="button-ghost mt-3 w-full">Continuar comprando</Link>
            </aside>
          </div>
        )}
        {hydrated && <CartSuggestions store={slug} productIds={items.map(item => item.productId)} />}
      </main>
    </>
  );
}
