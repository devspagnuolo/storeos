'use client';
import { useEffect, useState } from 'react';
import { apiUrl } from '../../lib/config';
import type { ProductSummary } from '../../lib/api';
import { ProductCard } from '../product-card';

/** O que outras clientes levaram junto, depois mesmas categorias, mais vendidos e novidades. Some quando não há o que sugerir. */
export function CartSuggestions({ store, productIds }: { store: string; productIds: string[] }) {
  const [items, setItems] = useState<(ProductSummary & { boughtTogether?: boolean })[]>([]);
  const key = [...new Set(productIds)].sort().join(',');
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ store, ids: key });
    fetch(`${apiUrl}/catalog/recommendations?${params}`, { signal: controller.signal })
      .then(response => (response.ok ? response.json() : { items: [] }))
      .then((data: { items?: (ProductSummary & { boughtTogether?: boolean })[] }) => setItems(data.items ?? []))
      .catch(() => undefined);
    return () => controller.abort();
  }, [store, key]);
  if (!items.length) return null;
  return (
    <section className="mt-14" aria-labelledby="sugestoes">
      <h2 id="sugestoes" className="text-2xl font-bold">{items[0]?.boughtTogether ? 'Quem comprou também levou' : 'Você também pode gostar'}</h2>
      <div className="mt-6 grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
        {items.slice(0, 8).map(product => <ProductCard key={product.id} product={product} />)}
      </div>
    </section>
  );
}
