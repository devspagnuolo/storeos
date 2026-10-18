import type { Metadata } from 'next';
import { Header } from '../../components/header';
import { ProductGrid } from '../../components/product-grid';
import { ProductFilters } from '../../components/product-filters';
import { getFacets, getProducts } from '../../lib/api';
import { apiFilters, type FilterParams, readFilters, urlFilters } from '../../lib/product-filters';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Todos os produtos' };

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ page?: string } & FilterParams> }) {
  const query = await searchParams;
  const page = Math.max(Number(query.page) || 1, 1);
  const filters = readFilters(query);
  const [products, facets] = await Promise.all([getProducts({ page, ...apiFilters(filters) }), getFacets()]);
  return <><Header /><main className="shell py-12"><p className="text-sm font-semibold text-brand">COLEÇÃO</p><h1 className="text-3xl font-bold">Todos os produtos</h1><div className="mt-6"><ProductFilters facets={facets} filters={filters} basePath="/categorias" /></div><div className="mt-8"><ProductGrid page={products} basePath="/categorias" params={urlFilters(filters)} empty={products.total === 0 && (filters.selected.length || filters.min !== undefined || filters.max !== undefined) ? 'Nenhum produto com esses filtros. Tente tirar algum.' : 'Nenhum produto publicado ainda.'} /></div></main></>;
}
