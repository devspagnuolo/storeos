import Link from 'next/link';
import { productStatusLabel } from '../../../../lib/admin/labels';
import { adminFetch } from '../../../../lib/admin/session';
import type { AdminProductPage } from '../../../../lib/admin/types';
import { formatPrice } from '../../../../lib/format';

export const dynamic = 'force-dynamic';
const tone: Record<string, string> = { ACTIVE: 'bg-emerald-100 text-emerald-800', DRAFT: 'bg-slate-100 text-slate-700', ARCHIVED: 'bg-slate-200 text-slate-500' };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  const q = params.q?.trim().slice(0, 100) ?? '';
  const page = Math.max(Number(params.page) || 1, 1);
  const data = await adminFetch<AdminProductPage>(`/catalog/admin/products?${new URLSearchParams({ page: String(page), pageSize: '25', ...(q && { q }) })}`);
  const pages = Math.max(Math.ceil(data.total / data.pageSize), 1);
  const href = (n: number) => `/admin/produtos?${new URLSearchParams({ ...(q && { q }), page: String(n) })}`;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-3xl font-bold">Produtos</h1><Link href="/admin/produtos/novo" className="button">Novo produto</Link></div>
      <form className="mt-6 flex max-w-md gap-2"><input name="q" defaultValue={q} placeholder="Buscar por nome ou SKU" className="input !mt-0" /><button className="button-ghost">Buscar</button></form>
      <div className="card mt-6 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-5 py-3">Produto</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Preço</th><th className="px-5 py-3 text-right">Estoque</th></tr></thead>
          <tbody className="divide-y">
            {data.items.map(p => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-5 py-3"><Link href={`/admin/produtos/${p.id}`} className="flex items-center gap-3"><span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100">{p.images[0] && <img src={p.images[0].url} alt="" className="h-full w-full object-cover" />}</span><span><span className="font-medium text-brand">{p.name}</span><span className="block text-xs text-slate-400">SKU {p.sku}</span></span></Link></td>
                <td className="px-5 py-3"><span className={`badge ${tone[p.status]}`}>{productStatusLabel[p.status]}</span></td>
                <td className="px-5 py-3 text-right">{formatPrice(p.price)}</td>
                <td className={`px-5 py-3 text-right ${p.stock - p.reserved <= 3 ? 'font-semibold text-amber-700' : ''}`}>{p.stock - p.reserved} disp.{p.reserved > 0 && <span className="block text-xs font-normal text-slate-400">{p.reserved} reservado(s)</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.items.length && <p className="p-8 text-center text-slate-500">Nenhum produto encontrado.</p>}
      </div>
      {pages > 1 && <nav className="mt-6 flex justify-center gap-4 text-sm">{page > 1 && <Link href={href(page - 1)}>← Anterior</Link>}<span className="text-slate-500">Página {page} de {pages}</span>{page < pages && <Link href={href(page + 1)}>Próxima →</Link>}</nav>}
    </>
  );
}
