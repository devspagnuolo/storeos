import Link from 'next/link';
import { StorefrontHistory } from '../../../../components/admin/storefront-editor';
import { StorefrontBuilder } from '../../../../components/admin/storefront-builder';
import { ApiError, adminFetch } from '../../../../lib/admin/session';
import type { StorefrontState, ThemeStatus } from '../../../../lib/admin/storefront';
import { discardThemeDraftAction } from '../../actions';
import { getBanners, getPages } from '../../../../lib/api';

export const dynamic = 'force-dynamic';

type Installation = { id: string; status: string; savedAt: string | null; release: { version: string; manifest: { displayName: string } }; drafts: { updatedAt: string }[] };

/**
 * Deixa a loja no editor novo sem precisar de clique: sem tema no ar, a API publica a conversão do editor clássico
 * (mesmas cores, aviso, banners e seções). Se falhar, a página segue com o editor clássico e mostra o motivo.
 */
async function ensureCurrentTheme(): Promise<{ status: ThemeStatus | null; error?: string }> {
  try {
    return { status: (await adminFetch<{ status: ThemeStatus }>('/themes/current', { method: 'POST', body: {} })).status };
  } catch (error) {
    const status = await adminFetch<ThemeStatus>('/themes/status').catch(() => null);
    return { status, error: error instanceof ApiError ? error.message : 'Não foi possível levar a loja para o editor novo.' };
  }
}

export default async function StorefrontPage({ searchParams }: { searchParams: Promise<{ salvo?: string; erro?: string }> }) {
  const [{ status, error }, params] = await Promise.all([ensureCurrentTheme(), searchParams]);
  const [state, banners, pages, installations] = await Promise.all([adminFetch<StorefrontState>('/store/storefront'), getBanners(), getPages(), adminFetch<Installation[]>('/themes/installations').catch(() => [])]);
  const live = status?.active?.live ? status.active : null;
  const saved = installations.filter(item => item.id !== live?.installationId && item.savedAt && item.drafts.length);
  const notices: Record<string, string> = {
    tema: 'Tema aplicado ao rascunho. Troque textos e imagens, escolha seus produtos e publique quando estiver pronta.',
    voltou: 'Tema avançado desativado. A loja voltou a seguir este editor.',
    restaurado: 'Versão recuperada como rascunho. Revise a prévia ao lado e publique quando estiver pronta.',
    descartado: 'Rascunho descartado. A loja não mudou.',
  };
  return <>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0"><p className="text-sm font-semibold text-brand">APARÊNCIA DA LOJA</p><h1 className="mt-1 text-3xl font-bold">Personalizar loja</h1>
        <p className="mt-2 max-w-2xl text-slate-600">{live ? 'Sua loja é desenhada pelo tema abaixo. Clique em Editar para mudar banners, seções, cores e textos; a loja só muda quando você publicar.' : 'Ajuste à esquerda e veja o resultado na prévia ao lado, no computador e no celular. Tudo é salvo sozinho como rascunho privado: a loja só muda quando você clicar em Publicar.'}</p></div>
      <Link href="/painel/site/temas" className="button-ghost shrink-0 text-sm">Trocar tema</Link>
    </div>
    {params.salvo && notices[params.salvo] && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notices[params.salvo]}</p>}
    {params.erro && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{params.erro}</p>}
    {error && <p role="alert" className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">A loja continua no editor clássico: {error}</p>}

    {live && <section aria-labelledby="tema-atual" className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-surface p-5">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tema em uso na loja</p>
        <h2 id="tema-atual" className="mt-1 text-2xl font-bold">{live.name}</h2>
        <p className="mt-1 text-sm text-slate-500">Versão {live.version} · no ar</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href="/" target="_blank" rel="noopener" className="button-ghost">Visualizar</a>
        <Link href={'/painel/site/temas/' + live.installationId} className="button">Editar</Link>
      </div>
    </section>}

    {saved.length > 0 && <section aria-labelledby="guardados" className="mt-5 rounded-xl border bg-surface p-4 text-sm">
      <h2 id="guardados" className="font-semibold">Rascunhos guardados (não aparecem na loja)</h2>
      <ul className="mt-3 grid gap-2">{saved.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
        <span className="min-w-0"><b>{item.release.manifest.displayName}</b> <span className="text-slate-500">· versão {item.release.version} · salvo em {new Date(item.drafts[0].updatedAt).toLocaleDateString('pt-BR')}</span></span>
        <span className="flex gap-2"><Link href={'/painel/site/temas/' + item.id} className="button-ghost text-xs">Continuar editando</Link><form action={discardThemeDraftAction}><input type="hidden" name="installationId" value={item.id} /><input type="hidden" name="back" value="site" /><button type="submit" className="button-ghost text-xs text-red-700">Descartar</button></form></span>
      </li>)}</ul>
    </section>}

    {live ? <section aria-labelledby="marca" className="mt-8">
      <h2 id="marca" className="text-xl font-bold">Logo e favicon</h2>
      <p className="mt-1 text-sm text-slate-500">Valem para qualquer tema. Envie a imagem e clique em Publicar.</p>
      <div className="mt-4"><StorefrontBuilder key={state.version} state={state} hasBanners={banners.length > 0} institutional={pages.map(p => ({ slug: p.slug, title: p.title }))} brandOnly /></div>
    </section> : <>
      <div className="mt-6"><StorefrontBuilder key={state.version} state={state} hasBanners={banners.length > 0} institutional={pages.map(p => ({ slug: p.slug, title: p.title }))} /></div>
      <StorefrontHistory key={'history-' + state.version} state={state} />
    </>}
  </>;
}
