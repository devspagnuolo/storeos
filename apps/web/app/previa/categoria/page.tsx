import { notFound } from 'next/navigation';
import { Header } from '../../../components/header';
import { ProductGrid } from '../../../components/product-grid';
import { HomeSections } from '../../../components/storefront/home-sections';
import { adminFetch } from '../../../lib/admin/session';
import type { StorefrontState } from '../../../lib/admin/storefront';
import { getCategories, getProducts } from '../../../lib/api';
import { themeStyle } from '../../../lib/theme';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Prévia da página de categoria', robots: { index: false, follow: false } };

/** Prévia privada da página de categoria: conteúdo fixo de exemplo (primeira categoria) + seções do rascunho. */
export default async function CategoryPreview() {
  const state = await adminFetch<StorefrontState>('/store/storefront').catch(() => null);
  if (!state) notFound();
  const theme = state.draft ?? state.published;
  const category = (await getCategories())[0];
  const products = await getProducts(category ? { category: category.slug } : {});
  return <div style={themeStyle(theme)} className="min-h-screen bg-slate-50 text-slate-900">
    <div role="note" className="bg-amber-50 px-4 py-1.5 text-center text-xs font-semibold text-amber-800">Prévia da página de categoria — a parte de cima é um exemplo; as seções abaixo vêm do rascunho</div>
    <Header />
    <main className="shell py-12"><p className="text-sm font-semibold text-brand">CATEGORIA</p><h1 className="text-3xl font-bold">{category?.name ?? 'Nome da categoria'}</h1>
      <div className="mt-8"><ProductGrid page={products} basePath="/previa/categoria" empty="Nenhum produto nesta categoria ainda." /></div></main>
    <HomeSections sections={theme.pages?.category?.sections ?? []} />
  </div>;
}
