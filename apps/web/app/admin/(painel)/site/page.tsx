import Link from 'next/link';
import { StorefrontHistory } from '../../../../components/admin/storefront-editor';
import { StorefrontBuilder } from '../../../../components/admin/storefront-builder';
import { adminFetch } from '../../../../lib/admin/session';
import type { StorefrontState, ThemeStatus } from '../../../../lib/admin/storefront';
import { deactivateThemeAction } from '../../actions';
import { getBanners, getPages } from '../../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function StorefrontPage({ searchParams }: { searchParams: Promise<{ salvo?: string }> }) {
  const [state, banners, pages, installations, status, params] = await Promise.all([adminFetch<StorefrontState>('/store/storefront'), getBanners(), getPages(), adminFetch<{ id: string; status: string; release: { manifest: { displayName: string } }; drafts: { updatedAt: string }[] }[]>('/themes/installations').catch(() => []), adminFetch<ThemeStatus>('/themes/status').catch(() => null), searchParams]);
  const advanced = status?.active?.live ? installations.find(item => item.id === status.active?.installationId) : undefined;
  const drafts = installations.filter(item => item.id !== advanced?.id && item.drafts.length);
  const notices: Record<string, string> = {
    tema: 'Tema aplicado ao rascunho. Troque textos e imagens, escolha seus produtos e publique quando estiver pronta.',
    voltou: 'Tema avançado desativado. A loja voltou a seguir este editor.',
    restaurado: 'Versão recuperada como rascunho. Revise a prévia ao lado e publique quando estiver pronta.',
  };
  return <>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0"><p className="text-sm font-semibold text-brand">APARÊNCIA DA LOJA</p><h1 className="mt-1 text-3xl font-bold">Personalizar loja</h1>
        <p className="mt-2 max-w-2xl text-slate-600">Ajuste à esquerda e veja o resultado na prévia ao lado, no computador e no celular. Tudo é salvo sozinho como rascunho privado: a loja só muda quando você clicar em Publicar.</p></div>
      <Link href="/painel/site/temas" className="button-ghost shrink-0 text-sm">Trocar tema</Link>
    </div>
    <ThemeControl status={status} advancedName={advanced?.release.manifest.displayName} drafts={drafts.map(item => ({ id: item.id, name: item.release.manifest.displayName, updatedAt: item.drafts[0].updatedAt }))} />
    {advanced && <section role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <h2 className="font-bold">A loja está sob o tema avançado “{advanced.release.manifest.displayName}”</h2>
      <p className="mt-1">Por isso as mudanças que você publicar aqui não aparecem nas páginas que o tema desenha (veja o quadro acima). Logo, menus, rodapé e o texto das páginas continuam vindo do painel.</p>
      <form action={deactivateThemeAction} className="mt-3"><input type="hidden" name="installationId" value={advanced.id} /><button className="button-ghost" type="submit">Voltar a usar este editor</button></form>
    </section>}
    {params.salvo && notices[params.salvo] && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notices[params.salvo]}</p>}
    <div className="mt-6"><StorefrontBuilder key={state.version} state={state} hasBanners={banners.length > 0} institutional={pages.map(p => ({ slug: p.slug, title: p.title }))} /></div>
    <StorefrontHistory key={'history-' + state.version} state={state} />
  </>;
}

const PAGE_LABELS: Record<string, string> = { home: 'Página inicial', category: 'Categorias', product: 'Página de produto', search: 'Busca', cart: 'Carrinho', page: 'Páginas de conteúdo', 'blog-index': 'Blog', 'blog-post': 'Artigos do blog', 'not-found': 'Página não encontrada', visual: 'Cores, fontes e marca' };

/** Mostra quem desenha cada página da loja e os rascunhos de temas que ainda não estão no ar. */
function ThemeControl({ status, advancedName, drafts }: { status: ThemeStatus | null; advancedName?: string; drafts: { id: string; name: string; updatedAt: string }[] }) {
  const templates = status?.templates ?? Object.keys(PAGE_LABELS).map(pageType => ({ pageType, controlledBy: 'editor' as const }));
  return <section aria-labelledby="quem-desenha" className="mt-5 rounded-xl border bg-surface p-4 text-sm">
    <h2 id="quem-desenha" className="font-semibold">Quem desenha cada página da loja</h2>
    <ul className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
      {templates.map(item => <li key={item.pageType} className="rounded-lg bg-slate-50 px-3 py-2">
        <span className="block font-medium">{PAGE_LABELS[item.pageType] ?? item.pageType}</span>
        <span className={'text-xs ' + (item.controlledBy === 'engine' ? 'text-amber-800' : 'text-slate-500')}>{item.controlledBy === 'engine' ? `Tema avançado “${advancedName ?? 'ativo'}”` : 'Este editor'}</span>
      </li>)}
    </ul>
    {drafts.length > 0 && <div className="mt-4 border-t pt-3">
      <p className="text-slate-600">Rascunhos de temas guardados (não aparecem na loja):</p>
      <ul className="mt-2 flex flex-wrap gap-2">{drafts.map(draft => <li key={draft.id}><Link href={'/painel/site/temas/' + draft.id} className="button-ghost text-xs">Continuar editando {draft.name}</Link></li>)}</ul>
    </div>}
  </section>;
}
