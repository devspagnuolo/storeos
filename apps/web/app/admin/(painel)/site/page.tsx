import Link from 'next/link';
import { StorefrontHistory } from '../../../../components/admin/storefront-editor';
import { StorefrontBuilder } from '../../../../components/admin/storefront-builder';
import { adminFetch } from '../../../../lib/admin/session';
import type { StorefrontState } from '../../../../lib/admin/storefront';
import { deactivateThemeAction } from '../../actions';
import { getBanners, getPages } from '../../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function StorefrontPage({ searchParams }: { searchParams: Promise<{ salvo?: string }> }) {
  const [state, banners, pages, installations, params] = await Promise.all([adminFetch<StorefrontState>('/store/storefront'), getBanners(), getPages(), adminFetch<{ id: string; status: string; release: { manifest: { displayName: string } } }[]>('/themes/installations').catch(() => []), searchParams]);
  const advanced = installations.find(item => item.status === 'ACTIVE');
  const notices: Record<string, string> = {
    tema: 'Tema aplicado ao rascunho. Troque textos e imagens, escolha seus produtos e publique quando estiver pronta.',
    voltou: 'Tema avançado desativado. A página inicial voltou a seguir este editor.',
    restaurado: 'Versão recuperada como rascunho. Revise a prévia ao lado e publique quando estiver pronta.',
  };
  return <>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0"><p className="text-sm font-semibold text-brand">APARÊNCIA DA LOJA</p><h1 className="mt-1 text-3xl font-bold">Personalizar loja</h1>
        <p className="mt-2 max-w-2xl text-slate-600">Ajuste à esquerda e veja o resultado na prévia ao lado, no computador e no celular. Tudo é salvo sozinho como rascunho privado: a loja só muda quando você clicar em Publicar.</p></div>
      <Link href="/painel/site/temas" className="button-ghost shrink-0 text-sm">Ver temas prontos</Link>
    </div>
    {advanced && <section role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <h2 className="font-bold">A página inicial está sob o tema avançado “{advanced.release.manifest.displayName}”</h2>
      <p className="mt-1">Por isso as mudanças que você publicar aqui na página inicial não aparecem na loja. Categoria, produto e visual continuam seguindo este editor.</p>
      <form action={deactivateThemeAction} className="mt-3"><input type="hidden" name="installationId" value={advanced.id} /><button className="button-ghost" type="submit">Voltar a usar este editor na página inicial</button></form>
    </section>}
    {params.salvo && notices[params.salvo] && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notices[params.salvo]}</p>}
    <div className="mt-6"><StorefrontBuilder key={state.version} state={state} hasBanners={banners.length > 0} institutional={pages.map(p => ({ slug: p.slug, title: p.title }))} /></div>
    <StorefrontHistory key={'history-' + state.version} state={state} />
  </>;
}
