import { StorefrontEditor, StorefrontHistory } from '../../../../components/admin/storefront-editor';
import { adminFetch } from '../../../../lib/admin/session';
import type { StorefrontState } from '../../../../lib/admin/storefront';

export const dynamic = 'force-dynamic';

export default async function StorefrontPage({ searchParams }: { searchParams: Promise<{ salvo?: string }> }) {
  const [state, params] = await Promise.all([adminFetch<StorefrontState>('/store/storefront'), searchParams]);
  const notices: Record<string, string> = {
    rascunho: 'Rascunho salvo. A vitrine pública continua com o visual publicado.',
    publicado: 'Vitrine publicada. A versão anterior está disponível no histórico.',
    restaurado: 'Versão recuperada como rascunho. Revise a prévia e publique quando estiver pronta.',
  };
  return <>
    <p className="text-sm font-semibold text-brand">LOJA ONLINE</p>
    <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold">Personalizar loja</h1><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{state.draft ? 'Rascunho salvo' : 'Visual publicado'}</span></div>
    <p className="mt-3 max-w-3xl text-slate-600">Prepare o conteúdo, confira a prévia e salve para continuar depois. Publique quando quiser exibir as alterações aos clientes.</p>
    {params.salvo && notices[params.salvo] && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notices[params.salvo]}</p>}
    <div className="mt-8"><StorefrontEditor key={state.version} version={state.version} config={state.draft ?? state.published} /></div>
    <StorefrontHistory key={'history-' + state.version} state={state} />
  </>;
}
