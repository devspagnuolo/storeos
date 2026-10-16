'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cartCount, useCart } from '../lib/cart';

export function CartIcon({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M2.5 3.5h2.2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1l1.8-6.8H6" />
      <circle cx="9.5" cy="19.6" r="1.4" /><circle cx="17" cy="19.6" r="1.4" />
    </svg>
  );
}

/** Ícone do carrinho com a quantidade de itens. */
export function CartLink() {
  const count = useCart(state => cartCount(state.items));
  // O carrinho vem do localStorage; só mostramos o número depois da hidratação para evitar divergência com o HTML do servidor.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const shown = hydrated ? count : 0;
  return (
    <Link href="/carrinho" className="flex flex-col items-center gap-0.5 rounded-xl px-1.5 py-1 hover:text-brand" aria-label={`Meu carrinho, ${shown} ${shown === 1 ? 'item' : 'itens'}`}>
      <span className="relative">
        <CartIcon className="h-6 w-6 sm:h-7 sm:w-7" />
        <span aria-hidden className="absolute -right-2 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-bold leading-none text-brand-fg">{shown > 99 ? '99+' : shown}</span>
      </span>
      <span aria-hidden className="text-[11px] font-medium sm:text-xs">Meu carrinho</span>
    </Link>
  );
}
