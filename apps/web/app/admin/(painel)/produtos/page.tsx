import Link from 'next/link';
import { ProductTable } from '../../../../components/admin/product-table';
import { adminFetch } from '../../../../lib/admin/session';
import type { AdminProductPage } from '../../../../lib/admin/types';
import { getCategories } from '../../../../lib/api';
import { buildTree, flatten } from '../../../../lib/category-tree';

export const dynamic = 'force-dynamic';

/** Abas por situação: a lista abre nos ativos, que são os que aparecem no site. */
const TABS = [
  { key: 'ativos', status: 'ACTIVE', label: 'Ativos' },
  { key: 'inativos', status: 'ARCHIVED', label: 'Inativos' },
  { key: 'rascunhos', status: 'DRAFT', label: 'Rascunhos' },
  { key: 'todos', status: '', label: 'Todos' },
] as const;

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; categoria?: string; situacao?: string; porPagina?: string }> }) {
  const params = await searchParams;
  const q = params.q?.trim().slice(0, 100) ?? '';
  const categoria = params.categoria?.slice(0, 160) ?? '';
  const tab = TABS.find(t => t.key === params.situacao) ?? TABS[0];
  const pageSize = ['25', '50', '100'].includes(params.porPagina ?? '') ? params.porPagina! : '50';
  const categories = flatten(buildTree(await getCategories()));
  const page = Math.max(Number(params.page) || 1, 1);
  const data = await adminFetch<AdminProductPage>(`/catalog/admin/products?${new URLSearchParams({ page: String(page), pageSize, ...(q && { q }), ...(categoria && { category: categoria }), ...(tab.status && { status: tab.status }) })}`);
  const pages = Math.max(Math.ceil(data.total / data.pageSize), 1);
  const href = (patch: Record<string, string>) => `/admin/produtos?${new URLSearchParams({ ...(q && { q }), ...(categoria && { categoria }), situacao: tab.key, ...(pageSize !== '50' && { porPagina: pageSize }), ...patch })}`;
  const count = (status: string) => status ? data.counts?.[status as 'ACTIVE'] ?? 0 : Object.values(data.counts ?? {}).reduce((sum, n) => sum + n, 0);
  const first = data.total ? (page - 1) * data.pageSize + 1 : 0;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-3xl font-bold">Produtos</h1><p className="mt-1 text-sm text-slate-500">Ativos aparecem no site. Inativos saem da vitrine, mas ficam guardados com o histórico de pedidos.</p></div>
        <div className="flex flex-wrap gap-2"><Link href="/painel/bling#importar" className="rounded border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-medium text-brand">Importar do Bling</Link><Link href="/painel/produtos/importar" className="rounded border px-4 py-2 text-sm font-medium">Planilha (importar / exportar)</Link><Link href="/admin/produtos/novo" className="button">Novo produto</Link></div>
      </div>

      <nav aria-label="Situação" className="mt-6 flex gap-1 overflow-x-auto border-b">
        {TABS.map(t => (
          <Link key={t.key} href={href({ situacao: t.key })} aria-current={t.key === tab.key ? 'page' : undefined} className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${t.key === tab.key ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {t.label} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{count(t.status)}</span>
          </Link>
        ))}
      </nav>

      <form className="mt-4 flex flex-wrap gap-2">
        <input type="hidden" name="situacao" value={tab.key} />
        <input name="q" defaultValue={q} placeholder="Buscar por nome ou código" className="input !mt-0 w-full sm:max-w-xs" />
        <select name="categoria" defaultValue={categoria} aria-label="Filtrar por categoria" className="input !mt-0 w-full sm:max-w-xs"><option value="">Todas as categorias</option>{categories.map(c => <option key={c.id} value={c.slug}>{'— '.repeat(c.depth - 1)}{c.name}</option>)}</select>
        <select name="porPagina" defaultValue={pageSize} aria-label="Itens por página" className="input !mt-0 w-auto"><option value="25">25 por página</option><option value="50">50 por página</option><option value="100">100 por página</option></select>
        <button className="button-ghost">Filtrar</button>
        {(q || categoria) && <Link href={`/admin/produtos?situacao=${tab.key}`} className="self-center text-sm underline">Limpar</Link>}
      </form>

      <ProductTable key={`${tab.key}-${page}-${q}-${categoria}`} items={data.items} />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
        <span>{data.total ? `${first}–${first + data.items.length - 1} de ${data.total}` : 'Nenhum produto'}</span>
        {pages > 1 && <nav className="flex items-center gap-4">{page > 1 && <Link href={href({ page: String(page - 1) })} className="text-brand">← Anterior</Link>}<span>Página {page} de {pages}</span>{page < pages && <Link href={href({ page: String(page + 1) })} className="text-brand">Próxima →</Link>}</nav>}
      </div>
    </>
  );
}
