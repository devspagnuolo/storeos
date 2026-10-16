import Link from 'next/link';
import { ThemeDraftEditor, type LinkOption } from '../../../../../../components/admin/theme-draft-editor';
import { restoreThemePublicationAction } from '../../../../actions';
import { getCategories, getCollections, getPages } from '../../../../../../lib/api';
import { adminFetch } from '../../../../../../lib/admin/session';
import type { ThemeStatus } from '../../../../../../lib/admin/storefront';

export const dynamic = 'force-dynamic';

type ThemeDraftResponse = {
  installation: { id: string; status: string; release: { version: string; manifest: import('../../../../../../components/admin/theme-draft-editor').ThemeManifest } };
  draft: { revision: number; document: import('../../../../../../components/admin/theme-draft-editor').ThemeDocument };
};

type Publication = { id: string; version: number; createdAt: string; installationId: string; themeName: string; themeVersion: string; live: boolean };

export default async function EditThemePage({ params, searchParams }: { params: Promise<{ installationId: string }>; searchParams: Promise<{ erro?: string; restaurado?: string }> }) {
  const { installationId } = await params;
  const query = await searchParams;
  const [result, status] = await Promise.all([
    adminFetch<ThemeDraftResponse>(`/themes/installations/${encodeURIComponent(installationId)}/draft`),
    adminFetch<ThemeStatus>('/themes/status').catch(() => null),
  ]);
  const [categories, collections, pages] = await Promise.all([getCategories(), getCollections(), getPages()]);
  const links: LinkOption[] = [
    { group: 'Loja', label: 'Página inicial', href: '/' },
    { group: 'Loja', label: 'Todos os produtos', href: '/categorias' },
    { group: 'Loja', label: 'Busca', href: '/busca' },
    ...categories.map(item => ({ group: 'Categorias', label: item.name, href: '/categorias/' + item.slug })),
    ...collections.map(item => ({ group: 'Coleções', label: item.name, href: '/colecoes/' + item.slug })),
    ...pages.map(item => ({ group: 'Páginas', label: item.title, href: '/p/' + item.slug })),
  ];
  const publications = (await adminFetch<Publication[]>('/themes/publications').catch(() => [])).filter(item => item.installationId === result.installation.id);
  return <>
    <nav aria-label="Caminho" className="text-sm"><Link href="/painel/site" className="font-medium text-brand hover:underline">Personalizar loja</Link> <span className="text-slate-400">›</span> <Link href="/painel/site/temas" className="font-medium text-brand hover:underline">Escolher tema</Link></nav>
    {query.restaurado && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Versão trazida de volta como rascunho. Confira a prévia e publique quando estiver pronta; a loja ainda não mudou.</p>}
    {query.erro && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{query.erro}</p>}
    <div className="mt-4">
      <ThemeDraftEditor key={query.restaurado ?? 'editor'} installationId={result.installation.id} initialRevision={result.draft.revision} initialDocument={result.draft.document} manifest={result.installation.release.manifest} publishEnabled={status?.publishEnabled ?? false} links={links} />
    </div>
    <section aria-labelledby="versoes" className="mt-8 rounded-2xl border bg-surface p-5">
      <h2 id="versoes" className="text-lg font-bold">Versões publicadas deste tema</h2>
      {publications.length ? <ul className="mt-3 grid gap-2">{publications.map((item, index) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
        <span>Versão {item.version} · {new Date(item.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}{index === 0 && item.live && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">no ar</span>}</span>
        <form action={restoreThemePublicationAction}><input type="hidden" name="publicationId" value={item.id} /><input type="hidden" name="installationId" value={result.installation.id} /><input type="hidden" name="revision" value={result.draft.revision} /><button className="button-ghost text-xs" type="submit">Trazer de volta como rascunho</button></form>
      </li>)}</ul> : <p className="mt-2 text-sm text-slate-500">Este tema ainda não foi publicado. Quando for, cada publicação fica guardada aqui para você voltar atrás.</p>}
      <p className="mt-3 text-xs text-slate-500">Trazer de volta substitui o rascunho atual deste tema, mas não muda a loja: você confere a prévia e publica de novo.</p>
    </section>
    <p className="mt-6 text-xs text-slate-500">{result.installation.status === 'ACTIVE' ? (status?.active?.live ? 'Este tema está publicado e desenha a página inicial da loja.' : 'Este tema está marcado como ativo, mas a loja segue o editor Personalizar loja enquanto a publicação avançada estiver em teste.') : 'Rascunho guardado: este tema não aparece na loja.'}</p>
  </>;
}
