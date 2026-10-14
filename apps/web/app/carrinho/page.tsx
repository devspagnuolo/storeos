'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Header } from '../../components/header';
import { ShippingCalculator } from '../../components/shipping-calculator';
import { cartSubtotalCents, lineKey, useCart } from '../../lib/cart';
import { formatPrice } from '../../lib/format';

export default function CartPage() {
  const { items, setQuantity } = useCart();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const subtotal = cartSubtotalCents(items) / 100;
  return (
    <>
      <Header />
      <main className="shell py-14">
        <h1 className="text-3xl font-bold">Seu carrinho</h1>
        {!hydrated ? null : !items.length ? (
          <div className="card mt-8 p-10 text-center text-slate-500">Seu carrinho está vazio. <Link href="/categorias" className="font-medium text-brand">Ver produtos</Link></div>
        ) : (
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
            <ul className="card h-fit divide-y">
              {items.map(item => (
                <li key={lineKey(item)} className="flex items-center gap-4 p-4">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">{item.image && <img src={item.image} alt={item.name} className="h-full w-full object-cover" />}</div>
                  <div className="flex-1"><Link href={`/produto/${item.slug}`} className="font-semibold hover:text-brand">{item.name}</Link>{item.variantLabel && <p className="text-sm text-slate-600">{item.variantLabel}</p>}<p className="text-sm text-slate-500">{formatPrice(item.price)}</p></div>
                  <div className="flex items-center gap-2">
                    <button aria-label={`Diminuir ${item.name}`} className="h-8 w-8 rounded-lg border" onClick={() => setQuantity(lineKey(item), item.quantity - 1)}>−</button>
                    <span className="w-6 text-center">{item.quantity}</span>
                    <button aria-label={`Aumentar ${item.name}`} className="h-8 w-8 rounded-lg border" onClick={() => setQuantity(lineKey(item), item.quantity + 1)}>+</button>
                  </div>
                  <p className="w-28 text-right font-bold">{formatPrice((Number(item.price) * 100 * item.quantity) / 100)}</p>
                </li>
              ))}
            </ul>
            <aside className="card h-fit p-6">
              <div className="flex justify-between"><span>Subtotal</span><b>{formatPrice(subtotal)}</b></div>
              <ShippingCalculator items={items} />
              <Link href="/checkout" className="button mt-6 w-full">Finalizar compra</Link>
            </aside>
          </div>
        )}
      </main>
    </>
  );
}
