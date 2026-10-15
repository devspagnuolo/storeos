import Link from 'next/link';
import { ThemeDraftEditor } from '../../../../../../components/admin/theme-draft-editor';
import { adminFetch } from '../../../../../../lib/admin/session';

export const dynamic = 'force-dynamic';

type ThemeDraftResponse = {
  installation: { id: string; status: string; release: { version: string; manifest: import('../../../../../../components/admin/theme-draft-editor').ThemeManifest } };
  draft: { revision: number; document: import('../../../../../../components/admin/theme-draft-editor').ThemeDocument };
};

export default async function EditThemePage({ params }: { params: Promise<{ installationId: string }> }) {
  const { installationId } = await params;
  const result = await adminFetch<ThemeDraftResponse>(`/themes/installations/${encodeURIComponent(installationId)}/draft`);
  return <>
    <Link href="/painel/site/temas" className="text-sm font-medium text-brand hover:underline">← Voltar para temas</Link>
    <div className="mt-4">
      <ThemeDraftEditor installationId={result.installation.id} initialRevision={result.draft.revision} initialDocument={result.draft.document} manifest={result.installation.release.manifest} />
    </div>
    <p className="mt-6 text-xs text-slate-500">Instalação {result.installation.id} · estado {result.installation.status === 'ACTIVE' ? 'ativo no modelo de dados' : 'inativo'}</p>
  </>;
}
