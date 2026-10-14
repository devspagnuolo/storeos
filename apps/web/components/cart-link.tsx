'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cartCount, useCart } from '../lib/cart';

export function CartLink() {
  const count = useCart(state => cartCount(state.items));
  // O carrinho vem do localStorage; só mostramos o número depois da hidratação para evitar divergência com o HTML do servidor.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return <Link href="/carrinho" className="button !py-2">Carrinho{hydrated && count > 0 && <span className="ml-2 rounded-full bg-white px-2 text-xs font-bold text-brand">{count}</span>}</Link>;
}
