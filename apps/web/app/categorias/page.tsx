import type { Metadata } from 'next';
import { CategoryNav } from '../../components/category-nav';
import { Header } from '../../components/header';
import { ProductGrid } from '../../components/product-grid';
import { getCategories, getProducts } from '../../lib/api';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Todos os produtos' };

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Math.max(Number((await searchParams).page) || 1, 1);
  const [categories, products] = await Promise.all([getCategories(), getProducts({ page })]);
  return <><Header /><main className="shell py-12"><p className="text-sm font-semibold text-brand">COLEÇÃO</p><h1 className="mb-6 text-3xl font-bold">Todos os produtos</h1><CategoryNav categories={categories} /><div className="mt-8"><ProductGrid page={products} basePath="/categorias" empty="Nenhum produto publicado ainda." /></div></main></>;
}
