import Link from 'next/link';
import type { ProductPage } from '../lib/api';
import { ProductCard } from './product-card';

/** Grade de produtos com paginação por query string, preservando os demais filtros. */
export function ProductGrid({ page, basePath, params = {}, empty, columns = 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4' }: { page: ProductPage; basePath: string; params?: Record<string, string | string[]>; empty: string; columns?: string }) {
  if (!page.items.length) return <div className="card p-10 text-center text-slate-500">{empty}</div>;
  const pages = Math.ceil(page.total / page.pageSize);
  const href = (n: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) for (const item of [value].flat()) if (item) search.append(key, item);
    if (n > 1) search.set('page', String(n));
    return `${basePath}?${search}`;
  };
  return (
    <>
      <div className={'grid gap-4 ' + columns}>
        {page.items.map(product => <ProductCard product={product} key={product.id} />)}
      </div>
      {pages > 1 && (
        <nav className="mt-10 flex items-center justify-center gap-4 text-sm font-medium" aria-label="Paginação">
          {page.page > 1 && <Link href={href(page.page - 1)}>← Anterior</Link>}
          <span className="text-slate-500">Página {page.page} de {pages}</span>
          {page.page < pages && <Link href={href(page.page + 1)}>Próxima →</Link>}
        </nav>
      )}
    </>
  );
}
