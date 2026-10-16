import type { Metadata } from 'next';
import { Header } from '../../components/header';
import { ProductGrid } from '../../components/product-grid';
import { ProductFilters } from '../../components/product-filters';
import { getCategories, getFacets, getProducts } from '../../lib/api';
import { apiFilters, type FilterParams, readFilters, urlFilters } from '../../lib/product-filters';
import { buildTree, flatten } from '../../lib/category-tree';
import { activeEngineDocument, engineNumber, engineSection, engineText } from '../../lib/theme-engine';
import { gridColumns } from '../../lib/responsive-grid';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Buscar' };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; categoria?: string } & FilterParams> }) {
  const params = await searchParams;
  const q = params.q?.trim().slice(0, 100) ?? '';
  const page = Math.max(Number(params.page) || 1, 1);
  const categoria = params.categoria?.slice(0, 160) ?? '';
  const filters = readFilters(params);
  const search = engineSection(await activeEngineDocument(), 'search', 'storeos.search-results.v1');
  const pageSize = engineNumber(search?.limit, 4, 48);
  const searching = Boolean(q || categoria);
  const [categories, results, facets] = await Promise.all([getCategories(), searching ? getProducts({ q, category: categoria, page, ...(pageSize && { pageSize }), ...apiFilters(filters) }) : null, searching ? getFacets({ q, category: categoria }) : null]);
  const options = flatten(buildTree(categories));
  return (
    <>
      <Header />
      <main className="shell py-12">
        <h1 className="text-3xl font-bold">{engineText(search?.heading, 'Buscar produtos')}</h1>
        <form action="/busca" className="mt-6 flex max-w-2xl flex-wrap gap-2" role="search">
          <input name="q" defaultValue={q} placeholder="O que você procura?" aria-label="Buscar produtos" className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5" />
          <select name="categoria" defaultValue={categoria} aria-label="Filtrar por categoria" className="rounded-xl border border-slate-300 bg-white px-3 py-2.5"><option value="">Todas as categorias</option>{options.map(c => <option key={c.id} value={c.slug}>{'— '.repeat(c.depth - 1)}{c.name}</option>)}</select>
          <button className="button">Buscar</button>
        </form>
        {facets && <div className="mt-6"><ProductFilters facets={facets} filters={filters} basePath="/busca" keep={{ q, categoria }} /></div>}
        {results && <div className="mt-8"><p className="mb-6 text-sm text-slate-500">{results.total} resultado(s){q && <> para “{q}”</>}{categoria && <> em {options.find(c => c.slug === categoria)?.name ?? categoria}</>}</p><ProductGrid page={results} basePath="/busca" params={{ q, ...(categoria && { categoria }), ...urlFilters(filters) }} empty="Nenhum produto encontrado. Tente outro termo." columns={gridColumns(engineNumber(search?.mobileColumns, 1, 2), undefined, { mobile: 2, desktop: 4 })} /></div>}
      </main>
    </>
  );
}
