import Link from 'next/link';
import { installThemeAction } from '../../../actions';
import { adminFetch } from '../../../../../lib/admin/session';

export const dynamic = 'force-dynamic';

type ThemeRelease = {
  id: string;
  version: string;
  publishedAt: string | null;
  manifest: { displayName: string; slug: string; version: string; author?: { name?: string }; templates?: { pageType: string; title: string }[] };
  package: { key: string; name: string; description: string | null };
};
type ThemeInstallation = { id: string; releaseId: string; status: string; installedAt: string; release: ThemeRelease; drafts: { revision: number; updatedAt: string }[] };

export default async function ThemesPage({ searchParams }: { searchParams: Promise<{ instalado?: string; erro?: string }> }) {
  const [library, installations, params] = await Promise.all([
    adminFetch<ThemeRelease[]>('/themes/library'),
    adminFetch<ThemeInstallation[]>('/themes/installations'),
    searchParams,
  ]);
  const installedReleaseIds = new Set(installations.map(item => item.releaseId));

  return <>
    <p className="text-sm font-semibold text-brand">LOJA ONLINE</p>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-3xl font-bold">Temas</h1><p className="mt-2 max-w-3xl text-slate-600">Escolha um ponto de partida para a identidade da sua loja. Instalar não altera o site publicado.</p></div>
      <Link href="/painel/site" className="button">Personalizar loja atual</Link>
    </div>

    {params.instalado && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Tema instalado como rascunho. Sua loja publicada permaneceu inalterada.</p>}
    {params.erro && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{params.erro}</p>}

    <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
      <h2 className="font-bold">Sobre a instalação de temas</h2>
      <p className="mt-1">Instalar cria um rascunho e não muda o site. Ao publicar um tema desta biblioteca, ele passa a desenhar a <strong>página inicial</strong> e o editor “Personalizar loja atual” deixa de controlar essa página. Para ajustar a loja que os clientes veem hoje, use “Personalizar loja atual”.</p>
    </section>

    <section className="mt-10">
      <div className="mb-4 flex items-end justify-between gap-4"><div><h2 className="text-xl font-bold">Biblioteca STOREOS</h2><p className="mt-1 text-sm text-slate-500">Temas oficiais publicados e compatíveis com o runtime da plataforma.</p></div><span className="text-sm text-slate-500">{library.length} {library.length === 1 ? 'tema' : 'temas'}</span></div>
      {library.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {library.map(theme => {
          const installed = installedReleaseIds.has(theme.id);
          const installedItem = installations.find(item => item.releaseId === theme.id);
          const templateCount = theme.manifest.templates?.length ?? 0;
          return <article key={theme.id} className="overflow-hidden rounded-2xl border bg-surface shadow-sm">
            <div className="flex min-h-40 items-end bg-gradient-to-br from-violet-100 via-fuchsia-50 to-amber-50 p-5">
              <div className="rounded-xl border border-white/70 bg-white/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-violet-900">STOREOS · {theme.manifest.version}</div>
            </div>
            <div className="grid gap-4 p-5">
              <div><h3 className="text-lg font-bold">{theme.manifest.displayName}</h3><p className="mt-1 text-sm text-slate-600">{theme.package.description ?? 'Tema responsivo para sua loja virtual.'}</p></div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-500"><span className="rounded-full bg-slate-100 px-2.5 py-1">Por {theme.manifest.author?.name ?? 'STOREOS'}</span><span className="rounded-full bg-slate-100 px-2.5 py-1">{templateCount} modelos de página</span></div>
              {installed ? <div className="grid gap-2"><p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">Instalado nesta loja · rascunho inativo</p><Link className="button-ghost text-center" href={'/painel/site/temas/' + (installedItem?.id ?? '')}>Configurar rascunho</Link></div> : <form action={installThemeAction}><input type="hidden" name="releaseId" value={theme.id} /><button className="button w-full" type="submit">Instalar tema</button></form>}
            </div>
          </article>;
        })}
      </div> : <div className="rounded-2xl border border-dashed p-10 text-center"><h3 className="font-semibold">Nenhum tema disponível</h3><p className="mt-2 text-sm text-slate-500">A biblioteca será preenchida quando houver releases publicados e compatíveis.</p></div>}
    </section>

    <section className="mt-10">
      <h2 className="text-xl font-bold">Instalados nesta loja</h2>
      {installations.length ? <div className="mt-4 grid gap-3">{installations.map(item => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-surface p-4">
        <div><h3 className="font-semibold">{item.release.manifest.displayName}</h3><p className="mt-1 text-sm text-slate-500">Versão {item.release.version} · instalado em {new Date(item.installedAt).toLocaleDateString('pt-BR')} · rascunho {item.drafts[0]?.revision ?? '—'}</p></div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{item.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}</span>
      </article>)}</div> : <p className="mt-3 rounded-xl border border-dashed p-6 text-sm text-slate-500">Você ainda não instalou um tema.</p>}
    </section>
  </>;
}
