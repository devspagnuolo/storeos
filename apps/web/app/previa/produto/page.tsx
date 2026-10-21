import { notFound } from 'next/navigation';
import { Header } from '../../../components/header';
import { HomeSections } from '../../../components/storefront/home-sections';
import { adminFetch } from '../../../lib/admin/session';
import type { StorefrontState } from '../../../lib/admin/storefront';
import { getProducts } from '../../../lib/api';
import { formatPrice } from '../../../lib/format';
import { themeStyle } from '../../../lib/theme';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Prévia da página de produto', robots: { index: false, follow: false } };

/** Prévia privada da página de produto: resumo do primeiro produto como exemplo + seções do rascunho. */
export default async function ProductPreview() {
  const state = await adminFetch<StorefrontState>('/store/storefront').catch(() => null);
  if (!state) notFound();
  const theme = state.draft ?? state.published;
  const product = (await getProducts({ pageSize: 1 })).items[0];
  return <div style={themeStyle(theme)} className="min-h-screen bg-slate-50 text-slate-900">
    <div role="note" className="bg-amber-50 px-4 py-1.5 text-center text-xs font-semibold text-amber-800">Prévia da página de produto — a parte de cima é um exemplo; as seções abaixo vêm do rascunho</div>
    <Header />
    <main className="shell py-10"><div className="grid gap-10 md:grid-cols-2">
      <div className="card aspect-square overflow-hidden bg-gradient-to-br from-slate-100 to-violet-100">{product?.images?.[0] && <img src={product.images[0].url} alt="" className="h-full w-full object-contain object-center" />}</div>
      <div><h1 className="text-3xl font-bold">{product?.name ?? 'Nome do produto'}</h1><p className="mt-4 text-3xl font-black">{product ? formatPrice(product.price) : 'R$ 0,00'}</p><span className="button mt-6 inline-block">Adicionar ao carrinho</span></div>
    </div></main>
    <HomeSections sections={theme.pages?.product?.sections ?? []} />
  </div>;
}
