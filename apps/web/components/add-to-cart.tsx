'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { ProductVariant } from '../lib/api';
import { useCart } from '../lib/cart';
import { track } from '../lib/track';
import { formatPrice } from '../lib/format';

type Props = { product: { id: string; slug: string; name: string; price: string; image?: string }; available: number; variants?: ProductVariant[] };

const labelOf = (variant: ProductVariant) => variant.attributes.map(a => a.value).join(' / ');

export function AddToCart({ product, available, variants = [] }: Props) {
  const add = useCart(state => state.add);
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  // Uma escolha por atributo (Cor, Tamanho…); a variação sai da combinação escolhida.
  const attributeNames = useMemo(() => variants[0]?.attributes.map(a => a.name) ?? [], [variants]);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const optionsFor = (name: string, index: number) => [...new Set(variants.map(v => v.attributes[index]?.value))].filter(Boolean) as string[];
  const selected = variants.find(v => attributeNames.every((name, i) => picked[name] === v.attributes[i]?.value));
  const hasVariants = variants.length > 0;

  if (available < 1) return <p className="mt-8 rounded-xl bg-slate-100 p-4 font-medium text-slate-600">Produto esgotado no momento.</p>;
  const stock = hasVariants ? selected?.available ?? 0 : available;
  const max = Math.min(stock, 99);
  const price = selected?.price ?? product.price;
  const ready = !hasVariants || Boolean(selected && stock > 0);

  return (
    <div className="mt-8 grid gap-5">
      {hasVariants && attributeNames.map((name, index) => (
        <fieldset key={name}>
          <legend className="mb-2 text-sm font-semibold">{name}{picked[name] && <span className="ml-2 font-normal text-slate-500">{picked[name]}</span>}</legend>
          <div className="flex flex-wrap gap-2">
            {optionsFor(name, index).map(value => {
              // Esgotada = nenhuma variação com este valor (e as demais escolhas já feitas) tem saldo.
              const soldOut = !variants.some(v => v.attributes[index]?.value === value && v.available > 0 && attributeNames.every((other, i) => i === index || !picked[other] || picked[other] === v.attributes[i]?.value));
              const active = picked[name] === value;
              return <button key={value} type="button" aria-pressed={active} onClick={() => { setPicked(current => ({ ...current, [name]: value })); setQuantity(1); }} className={`rounded-xl border px-4 py-2 text-sm font-medium ${active ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white hover:border-brand'} ${soldOut ? 'opacity-40 line-through' : ''}`}>{value}</button>;
            })}
          </div>
        </fieldset>))}
      {hasVariants && selected && selected.price && <p className="text-2xl font-black">{formatPrice(price)}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="quantity">Quantidade</label>
        <select id="quantity" value={quantity} onChange={e => setQuantity(Number(e.target.value))} disabled={!ready} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 disabled:opacity-50">
          {Array.from({ length: Math.max(Math.min(max, 10), 1) }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button className="button disabled:opacity-60" disabled={!ready} onClick={() => { add({ productId: product.id, ...(selected && { variantId: selected.id, variantLabel: labelOf(selected) }), slug: product.slug, name: product.name, price: price, image: product.image }, quantity); track('add_to_cart', { value: Number(price) * quantity, items: [{ id: product.id, name: product.name, price: Number(price), quantity }] }); router.push('/carrinho'); }}>
          {hasVariants && !selected ? 'Escolha as opções' : hasVariants && stock < 1 ? 'Opção esgotada' : 'Adicionar ao carrinho'}
        </button>
        {ready && stock <= 5 && <p className="w-full text-sm text-amber-700">Restam apenas {stock} unidades.</p>}
      </div>
    </div>
  );
}
