'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiUrl } from '../../../lib/config';
import { useCart, type CartItem } from '../../../lib/cart';

/** Abre pelo link do e-mail: devolve os itens ao carrinho do navegador e segue para o carrinho, ou registra o pedido de não receber lembretes. */
export function RecoverCart({ token, optOut }: { token: string; optOut: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState('Recuperando seu carrinho…');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${apiUrl}/abandoned-carts/${optOut ? 'optout' : 'recover'}/${encodeURIComponent(token)}`, optOut ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' } : undefined);
        if (!response.ok) throw new Error();
        if (cancelled) return;
        if (optOut) { setMessage('Pronto! Você não receberá mais lembretes de carrinho.'); return; }
        const body = (await response.json()) as { items: CartItem[] };
        useCart.setState({ items: body.items });
        router.replace('/carrinho');
      } catch {
        if (!cancelled) { setFailed(true); setMessage('Este link não é mais válido.'); }
      }
    })();
    return () => { cancelled = true; };
  }, [token, optOut, router]);

  return (
    <>
      <h1 className="text-2xl font-bold">{optOut ? 'Lembretes de carrinho' : 'Seu carrinho'}</h1>
      <p className="mt-3 text-slate-600" role="status">{message}</p>
      {(failed || optOut) && <Link href="/" className="button mt-6 inline-block">Voltar para a loja</Link>}
    </>
  );
}
