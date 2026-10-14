import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CategoryNav } from '../../../components/category-nav';
import { Header } from '../../../components/header';
import { ProductGrid } from '../../../components/product-grid';
import { getCategories, getProducts } from '../../../lib/api';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = (await getCategories()).find(c => c.slug === slug);
  return { title: category ? `${category.name}` : 'Categoria', description: category?.description ?? undefined };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const page = Math.max(Number((await searchParams).page) || 1, 1);
  const [categories, products] = await Promise.all([getCategories(), getProducts({ category: slug, page })]);
  const category = categories.find(c => c.slug === slug);
  if (!category) notFound();
  return <><Header /><main className="shell py-12"><p className="text-sm font-semibold text-brand">CATEGORIA</p><h1 className="text-3xl font-bold">{category.name}</h1>{category.description && <p className="mt-2 text-slate-500">{category.description}</p>}<div className="mt-6"><CategoryNav categories={categories} active={slug} /></div><div className="mt-8"><ProductGrid page={products} basePath={`/categorias/${slug}`} empty="Nenhum produto nesta categoria ainda." /></div></main></>;
}
