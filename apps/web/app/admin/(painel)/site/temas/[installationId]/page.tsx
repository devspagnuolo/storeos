import Link from 'next/link';
import { ThemeDraftEditor } from '../../../../../../components/admin/theme-draft-editor';
import { adminFetch } from '../../../../../../lib/admin/session';
import type { ThemeStatus } from '../../../../../../lib/admin/storefront';

export const dynamic = 'force-dynamic';

type ThemeDraftResponse = {
  installation: { id: string; status: string; release: { version: string; manifest: import('../../../../../../components/admin/theme-draft-editor').ThemeManifest } };
  draft: { revision: number; document: import('../../../../../../components/admin/theme-draft-editor').ThemeDocument };
};

export default async function EditThemePage({ params }: { params: Promise<{ installationId: string }> }) {
  const { installationId } = await params;
  const [result, status] = await Promise.all([
    adminFetch<ThemeDraftResponse>(`/themes/installations/${encodeURIComponent(installationId)}/draft`),
    adminFetch<ThemeStatus>('/themes/status').catch(() => null),
  ]);
  return <>
    <nav aria-label="Caminho" className="text-sm"><Link href="/painel/site" className="font-medium text-brand hover:underline">Personalizar loja</Link> <span className="text-slate-400">›</span> <Link href="/painel/site/temas" className="font-medium text-brand hover:underline">Escolher tema</Link></nav>
    <div className="mt-4">
      <ThemeDraftEditor installationId={result.installation.id} initialRevision={result.draft.revision} initialDocument={result.draft.document} manifest={result.installation.release.manifest} publishEnabled={status?.publishEnabled ?? false} />
    </div>
    <p className="mt-6 text-xs text-slate-500">{result.installation.status === 'ACTIVE' ? (status?.active?.live ? 'Este tema está publicado e desenha a página inicial da loja.' : 'Este tema está marcado como ativo, mas a loja segue o editor Personalizar loja enquanto a publicação avançada estiver em teste.') : 'Rascunho guardado: este tema não aparece na loja.'}</p>
  </>;
}
