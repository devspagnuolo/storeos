import { notFound } from 'next/navigation';
import type { ThemeDocument } from '@storeos/contracts';
import { ThemeEngineHome } from '../../../../components/storefront/theme-engine-home';
import { getStore } from '../../../../lib/api';
import { adminFetch } from '../../../../lib/admin/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Prévia do tema', robots: { index: false, follow: false } };

type DraftResponse = {
  installation: { release: { manifest: { displayName: string; slug: string; version: string } } };
  draft: { revision: number; document: ThemeDocument };
};

/**
 * Prévia privada do rascunho de um tema avançado, desenhada pelo MESMO runtime da vitrine e com
 * produtos e categorias reais. Só abre com a sessão do painel (cookie httpOnly) e a API confere
 * que a instalação é da loja logada; sem sessão ou de outra loja, 404.
 */
export default async function ThemeDraftPreview({ params }: { params: Promise<{ installationId: string }> }) {
  const { installationId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,96}$/.test(installationId)) notFound();
  const [result, store] = await Promise.all([
    adminFetch<DraftResponse>(`/themes/installations/${encodeURIComponent(installationId)}/draft`).catch(() => null),
    getStore(),
  ]);
  if (!result) notFound();
  const manifest = result.installation.release.manifest;
  return <div className="min-h-screen bg-white text-slate-900">
    <div role="note" className="bg-amber-50 px-4 py-1.5 text-center text-xs font-semibold text-amber-800">Prévia do rascunho do tema “{manifest.displayName}” (revisão {result.draft.revision}), com produtos reais. Só você vê esta página.</div>
    <ThemeEngineHome theme={{ document: result.draft.document, release: { manifest } }} store={store} />
  </div>;
}
