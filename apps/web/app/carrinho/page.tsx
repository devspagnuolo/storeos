'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Header } from '../../components/header';
import { CartLines, hasStockIssues } from '../../components/cart/cart-lines';
import { ShippingCalculator } from '../../components/shipping-calculator';
import { useStoreBrand } from '../../components/store-name';
import { useAvailability } from '../../lib/availability';
import { cartSubtotalCents, useCart } from '../../lib/cart';
import { formatPrice } from '../../lib/format';

export default function CartPage() {
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
        <h1 className="text-3xl font-bold">Seu carrinho</h1>
        {!hydrated ? null : !items.length ? (
          <div className="card mt-8 p-10 text-center text-slate-500">Seu carrinho está vazio. <Link href="/categorias" className="font-medium text-brand">Ver produtos</Link></div>
        ) : (
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
            <CartLines items={items} availability={availability} />
            <aside className="card h-fit p-6">
              <div className="flex justify-between"><span>Subtotal</span><b>{formatPrice(subtotal)}</b></div>
              <ShippingCalculator items={items} />
              {blocked
                ? <><p role="alert" className="mt-6 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Ajuste os itens marcados para continuar.</p><button type="button" disabled className="button mt-3 w-full opacity-60">Finalizar compra</button></>
                : <Link href="/checkout" className="button mt-6 w-full">Finalizar compra</Link>}
            </aside>
          </div>
        )}
      </main>
    </>
  );
}
