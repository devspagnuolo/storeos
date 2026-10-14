import { notFound } from 'next/navigation';
import { StorefrontHome } from '../../components/storefront/storefront-home';
import { adminFetch } from '../../lib/admin/session';
import type { StorefrontState } from '../../lib/admin/storefront';
import { themeStyle } from '../../lib/theme';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Prévia da loja', robots: { index: false, follow: false } };

/**
 * Prévia privada: só quem está logado no painel (cookie httpOnly) enxerga o RASCUNHO.
 * Sem sessão o painel redireciona para o login; a vitrine pública nunca recebe o rascunho.
 */
export default async function Preview() {
  const state = await adminFetch<StorefrontState>('/store/storefront').catch(() => null);
  if (!state) notFound();
  const theme = state.draft ?? state.published;
  return <div style={themeStyle(theme)} className="min-h-screen bg-slate-50 text-slate-900">
    <div role="note" className="bg-amber-50 px-4 py-1.5 text-center text-xs font-semibold text-amber-800">{state.draft ? 'Prévia do rascunho — ainda não publicado' : 'Prévia — igual ao que está publicado'}</div>
    <StorefrontHome theme={theme} />
  </div>;
}
