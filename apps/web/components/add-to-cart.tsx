'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCart } from '../lib/cart';

type Props = { product: { id: string; slug: string; name: string; price: string; image?: string }; available: number };

export function AddToCart({ product, available }: Props) {
  const add = useCart(state => state.add);
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  if (available < 1) return <p className="mt-8 rounded-xl bg-slate-100 p-4 font-medium text-slate-600">Produto esgotado no momento.</p>;
  const max = Math.min(available, 99);
  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      <label className="sr-only" htmlFor="quantity">Quantidade</label>
      <select id="quantity" value={quantity} onChange={e => setQuantity(Number(e.target.value))} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5">
        {Array.from({ length: Math.min(max, 10) }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
      </select>
      <button className="button" onClick={() => { add({ productId: product.id, slug: product.slug, name: product.name, price: product.price, image: product.image }, quantity); router.push('/carrinho'); }}>
        Adicionar ao carrinho
      </button>
      {available <= 5 && <p className="w-full text-sm text-amber-700">Restam apenas {available} unidades.</p>}
    </div>
  );
}
