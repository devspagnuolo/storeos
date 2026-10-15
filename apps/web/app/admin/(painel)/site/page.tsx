import { StorefrontHistory } from '../../../../components/admin/storefront-editor';
import { StorefrontBuilder } from '../../../../components/admin/storefront-builder';
import { adminFetch } from '../../../../lib/admin/session';
import type { StorefrontState } from '../../../../lib/admin/storefront';
import { getBanners, getPages } from '../../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function StorefrontPage({ searchParams }: { searchParams: Promise<{ salvo?: string }> }) {
  const [state, banners, pages, params] = await Promise.all([adminFetch<StorefrontState>('/store/storefront'), getBanners(), getPages(), searchParams]);
  const notices: Record<string, string> = {
    tema: 'Tema aplicado ao rascunho. Troque textos e imagens, escolha seus produtos e publique quando estiver pronta.',
    restaurado: 'Versão recuperada como rascunho. Revise a prévia ao lado e publique quando estiver pronta.',
  };
  return <>
    <p className="text-sm font-semibold text-brand">LOJA ONLINE</p>
    <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold">Personalizar loja</h1><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{state.draft ? 'Rascunho não publicado' : 'Visual publicado'}</span></div>
    <p className="mt-3 max-w-3xl text-slate-600">Páginas à esquerda, prévia no centro e configurações do elemento selecionado ao lado. Adicione, mova, oculte ou remova seções, escolha os produtos já cadastrados, confira no computador e no celular e publique quando quiser. Nada vai ao ar antes disso.</p>
    {params.salvo && notices[params.salvo] && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notices[params.salvo]}</p>}
    <div className="mt-8"><StorefrontBuilder key={state.version} state={state} hasBanners={banners.length > 0} institutional={pages.map(p => ({ slug: p.slug, title: p.title }))} /></div>
    <StorefrontHistory key={'history-' + state.version} state={state} />
  </>;
}
