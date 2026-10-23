import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CategoryBanner } from '../../../components/category-banner';
import { Header } from '../../../components/header';
import { ProductGrid } from '../../../components/product-grid';
import { HomeSections } from '../../../components/storefront/home-sections';
import { ProductFilters } from '../../../components/product-filters';
import { getCategories, getFacets, getProducts, getStore } from '../../../lib/api';
import { apiFilters, type FilterParams, readFilters, urlFilters } from '../../../lib/product-filters';
import { activeEngineDocument, showsClassicPageSections, engineNumber, engineSection, engineText } from '../../../lib/theme-engine';
import { gridColumns } from '../../../lib/responsive-grid';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string } & FilterParams> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = Math.max(Number((await searchParams).page) || 1, 1);
  const category = (await getCategories()).find(c => c.slug === slug);
  return { alternates: { canonical: page > 1 ? `/categorias/${slug}?page=${page}` : `/categorias/${slug}` }, title: category ? `${category.name}` : 'Categoria', description: category?.description ?? undefined, openGraph: { title: category?.name ?? 'Categoria', description: category?.description ?? undefined, type: 'website', locale: 'pt_BR' } };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  const page = Math.max(Number(query.page) || 1, 1);
  const filters = readFilters(query);
  const [engine, classicSections] = await Promise.all([activeEngineDocument(), showsClassicPageSections()]);
  const grid = engineSection(engine, 'category', 'storeos.product-collection.v1');
  const pageSize = engineNumber(grid?.limit, 1, 24);
  const [categories, products, store, facets] = await Promise.all([getCategories(), getProducts({ category: slug, page, ...(pageSize && { pageSize }), ...apiFilters(filters) }), getStore(), getFacets({ category: slug })]);
  const category = categories.find(c => c.slug === slug);
  if (!category) notFound();
  const subheading = engineText(grid?.subheading);
  return <><Header />{category.bannerUrl && <CategoryBanner category={category} />}<main className="shell py-12"><p className="text-sm font-semibold uppercase text-brand">{engineText(grid?.heading, 'Categoria')}</p><h1 className="text-3xl font-bold">{category.name}</h1>{category.description && <p className="mt-2 text-slate-500">{category.description}</p>}{subheading && <p className="mt-2 text-slate-500">{subheading}</p>}<div className="mt-6"><ProductFilters facets={facets} filters={filters} basePath={`/categorias/${slug}`} /></div><div className="mt-8"><ProductGrid page={products} basePath={`/categorias/${slug}`} params={urlFilters(filters)} empty={filters.selected.length || filters.min !== undefined || filters.max !== undefined ? 'Nenhum produto com esses filtros. Tente tirar algum.' : 'Nenhum produto nesta categoria ainda.'} columns={gridColumns(engineNumber(grid?.mobileColumns, 1, 2), engineNumber(grid?.columns, 2, 6), { mobile: 2, desktop: 4 })} /></div></main>{classicSections && <HomeSections sections={store.themeConfig?.pages?.category?.sections ?? []} />}</>;
}
