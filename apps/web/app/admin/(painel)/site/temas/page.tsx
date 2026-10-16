import Link from 'next/link';
import { deactivateThemeAction, installThemeAction, upgradeThemeAction } from '../../../actions';
import { ReadyThemeGallery, type ReadyThemeCard } from '../../../../../components/admin/ready-themes';
import { adminFetch } from '../../../../../lib/admin/session';
import type { ThemeStatus } from '../../../../../lib/admin/storefront';

export const dynamic = 'force-dynamic';

type ThemeRelease = {
  id: string;
  version: string;
  publishedAt: string | null;
  manifest: {
    displayName: string; slug: string; version: string; author?: { name?: string }; templates?: { pageType: string; title: string }[];
    defaultDocument?: { global?: { designTokens?: { colors?: Record<string, string>; typography?: { fontFamily?: string }; shape?: { buttonRadius?: string } } } };
  };
  package: { key: string; name: string; description: string | null };
};
type ThemeInstallation = { id: string; releaseId: string; status: string; installedAt: string; release: ThemeRelease; drafts: { revision: number; updatedAt: string }[]; upgrade?: { releaseId: string; version: string } | null };

const HEX = /^#[0-9a-f]{6}$/i;
const FONT_SAMPLES: Record<string, { label: string; family: string }> = { serif: { label: 'Serifada', family: 'Georgia, serif' }, 'sans-serif': { label: 'Sem serifa', family: 'Arial, sans-serif' }, system: { label: 'Padrão', family: 'system-ui, sans-serif' } };

/** Miniatura do tema feita só com os tokens validados do manifesto: cores, fonte e formato do botão. */
function ThemeSwatch({ theme }: { theme: ThemeRelease }) {
  const tokens = theme.manifest.defaultDocument?.global?.designTokens ?? {};
  const color = (key: string, fallback: string) => (HEX.test(tokens.colors?.[key] ?? '') ? tokens.colors![key] : fallback);
  const font = FONT_SAMPLES[tokens.typography?.fontFamily ?? 'system'] ?? FONT_SAMPLES.system;
  const radius = /^(?:[0-9]{1,2}px|9999px)$/.test(tokens.shape?.buttonRadius ?? '') ? tokens.shape!.buttonRadius : '12px';
  return <div className="flex min-h-40 flex-col justify-between gap-4 p-5" style={{ backgroundColor: color('background', '#FFFFFF'), color: color('text', '#0F172A'), fontFamily: font.family }} aria-hidden>
    <div className="flex items-center justify-between text-xs"><strong>Sua loja</strong><span className="opacity-60">Buscar · Carrinho</span></div>
    <div><p className="text-xl font-bold leading-tight">{theme.manifest.displayName}</p><span className="mt-3 inline-block px-4 py-1.5 text-xs font-semibold text-white" style={{ backgroundColor: color('primary', '#6D28D9'), borderRadius: radius }}>Comprar agora</span></div>
    <div className="flex gap-1.5">{['primary', 'background', 'text'].map(key => <span key={key} className="h-4 w-8 rounded border border-black/10" style={{ backgroundColor: color(key, '#FFFFFF') }} />)}<span className="ml-auto text-xs opacity-70">Fonte {font.label.toLowerCase()}</span></div>
  </div>;
}

export default async function ThemesPage({ searchParams }: { searchParams: Promise<{ instalado?: string; erro?: string }> }) {
  const [ready, library, installations, status, params] = await Promise.all([
    adminFetch<ReadyThemeCard[]>('/store/storefront/themes'),
    adminFetch<ThemeRelease[]>('/themes/library'),
    adminFetch<ThemeInstallation[]>('/themes/installations'),
    adminFetch<ThemeStatus>('/themes/status').catch(() => null),
    searchParams,
  ]);
  const installedReleaseIds = new Set(installations.map(item => item.releaseId));

  return <>
    <nav aria-label="Caminho" className="text-sm"><Link href="/painel/site" className="font-medium text-brand hover:underline">← Personalizar loja</Link></nav>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-3xl font-bold">Escolher tema</h1><p className="mt-2 max-w-3xl text-slate-600">Escolha um ponto de partida para a identidade da sua loja. O tema entra como rascunho: a loja que os clientes veem só muda quando você publicar.</p></div>
      <Link href="/painel/site" className="button">Continuar editando a loja</Link>
    </div>

    {params.instalado && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Tema instalado como rascunho. Sua loja publicada não mudou; clique em “Continuar editando” para montar o tema.</p>}
    {params.erro && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{params.erro}</p>}

    <section className="mt-8">
      <h2 className="text-xl font-bold">Temas prontos</h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">Escolha um ponto de partida completo: cores, tipografia e as seções da página inicial, de categoria e de produto. Depois é só trocar textos, imagens e produtos no editor.</p>
      <div className="mt-4"><ReadyThemeGallery themes={ready} confirmReplace /></div>
    </section>

    <section className="mt-12 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
      <h2 className="font-bold">Temas avançados (em teste)</h2>
      <p className="mt-1">Instalar cria um rascunho e não muda o site. {status?.publishEnabled
        ? <>Ao publicar um tema deste catálogo, ele passa a desenhar a loja inteira (início, categorias, produto, busca, carrinho, páginas, blog e 404) com as suas cores; textos de páginas e produtos continuam vindo do painel.</>
        : <>Você pode montar e salvar o rascunho, mas a publicação ainda não está liberada: ela chega quando a prévia real de todas as páginas estiver pronta. Até lá, sua loja segue o editor “Personalizar loja”.</>}</p>
    </section>

    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-xl font-bold">Catálogo de temas STOREOS</h2><p className="mt-1 text-sm text-slate-500">Temas oficiais revisados pela STOREOS: desenham todas as páginas da loja, funcionam no celular e nunca mudam preços, estoque ou pagamento.</p></div><span className="text-sm text-slate-500">{library.length} {library.length === 1 ? 'tema' : 'temas'}</span></div>
      {library.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {library.map(theme => {
          const installed = installedReleaseIds.has(theme.id);
          const installedItem = installations.find(item => item.releaseId === theme.id);
          const templateCount = theme.manifest.templates?.length ?? 0;
          return <article key={theme.id} className="overflow-hidden rounded-2xl border bg-surface shadow-sm">
            <ThemeSwatch theme={theme} />
            <div className="grid gap-4 p-5">
              <div><h3 className="text-lg font-bold">{theme.manifest.displayName}</h3><p className="mt-1 text-sm text-slate-600">{theme.package.description ?? 'Tema responsivo para sua loja virtual.'}</p></div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-500"><span className="rounded-full bg-slate-100 px-2.5 py-1">Por {theme.manifest.author?.name ?? 'STOREOS'}</span><span className="rounded-full bg-slate-100 px-2.5 py-1">{templateCount} modelos de página</span><span className="rounded-full bg-slate-100 px-2.5 py-1">Versão {theme.manifest.version}</span><span className="rounded-full bg-slate-100 px-2.5 py-1">Ajustes para celular</span></div>
              {installed ? <div className="grid gap-2"><p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">{installedItem?.status === 'ACTIVE' && status?.active?.live ? 'Publicado na loja' : 'Instalado como rascunho'}</p><Link className="button-ghost text-center" href={'/painel/site/temas/' + (installedItem?.id ?? '')}>Continuar editando</Link></div> : <form action={installThemeAction}><input type="hidden" name="releaseId" value={theme.id} /><button className="button w-full" type="submit">Instalar tema</button></form>}
            </div>
          </article>;
        })}
      </div> : <div className="rounded-2xl border border-dashed p-10 text-center"><h3 className="font-semibold">Nenhum tema disponível</h3><p className="mt-2 text-sm text-slate-500">A biblioteca será preenchida quando houver releases publicados e compatíveis.</p></div>}
    </section>

    <section className="mt-10">
      <h2 className="text-xl font-bold">Instalados nesta loja</h2>
      {installations.length ? <div className="mt-4 grid gap-3">{installations.map(item => <article key={item.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border bg-surface p-4">
        <div><h3 className="font-semibold">{item.release.manifest.displayName}</h3><p className="mt-1 text-sm text-slate-500">Versão {item.release.version} · instalado em {new Date(item.installedAt).toLocaleDateString('pt-BR')} · rascunho {item.drafts[0]?.revision ?? '—'}</p></div>
        <div className="flex flex-wrap items-center gap-3"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{item.status === 'ACTIVE' && status?.active?.live ? 'No ar' : 'Rascunho'}</span><Link className="button-ghost" href={'/painel/site/temas/' + item.id}>Continuar editando</Link>{item.upgrade && <form action={upgradeThemeAction}><input type="hidden" name="installationId" value={item.id} /><button className="button" type="submit" title="Cria um rascunho na versão nova com suas cores, textos e seções; nada é publicado">Atualizar para a versão {item.upgrade.version}</button></form>}{item.status === 'ACTIVE' && <form action={deactivateThemeAction}><input type="hidden" name="installationId" value={item.id} /><button className="button-ghost" type="submit">Desativar e voltar ao editor</button></form>}</div>
      </article>)}</div> : <p className="mt-3 rounded-xl border border-dashed p-6 text-sm text-slate-500">Você ainda não instalou um tema.</p>}
    </section>
  </>;
}
