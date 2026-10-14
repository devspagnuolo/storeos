import Link from 'next/link';
import type { ProductPage } from '../lib/api';
import { ProductCard } from './product-card';

/** Grade de produtos com paginação por query string, preservando os demais filtros. */
export function ProductGrid({ page, basePath, params = {}, empty }: { page: ProductPage; basePath: string; params?: Record<string, string>; empty: string }) {
  if (!page.items.length) return <div className="card p-10 text-center text-slate-500">{empty}</div>;
  const pages = Math.ceil(page.total / page.pageSize);
  const href = (n: number) => `${basePath}?${new URLSearchParams({ ...params, ...(n > 1 && { page: String(n) }) })}`;
  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
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
