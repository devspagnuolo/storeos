import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '../../../../components/ui/empty-state';
import { PageHeader } from '../../../../components/ui/page-header';
import { formatDateTime } from '../../../../lib/admin/labels';
import { ApiError, adminFetch } from '../../../../lib/admin/session';
import type { AuditPage } from '../../../../lib/admin/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Auditoria' };

const outcomes = [['', 'Todos'], ['SUCCESS', 'Concluídos'], ['DENIED', 'Negados'], ['FAILURE', 'Com erro']] as const;
const outcomeStyle: Record<string, string> = { SUCCESS: 'bg-emerald-100 text-emerald-800', DENIED: 'bg-amber-50 text-amber-800', FAILURE: 'bg-red-50 text-red-700' };
const outcomeLabel: Record<string, string> = { SUCCESS: 'Concluído', DENIED: 'Negado', FAILURE: 'Erro' };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ outcome?: string; page?: string }> }) {
  const params = await searchParams;
  const outcome = outcomes.some(([value]) => value === (params.outcome ?? '')) ? params.outcome ?? '' : '';
  const page = Math.max(Number(params.page) || 1, 1);
  let data: AuditPage;
  try {
    data = await adminFetch<AuditPage>(`/audit?${new URLSearchParams({ page: String(page), pageSize: '30', ...(outcome && { outcome }) })}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return <><PageHeader title="Auditoria" /><div className="card"><EmptyState title="Sem permissão para ver a auditoria" description="Peça ao dono da loja a permissão de consulta à auditoria." /></div></>;
    }
    throw error;
  }
  const pages = Math.max(Math.ceil(data.total / data.pageSize), 1);
  const href = (next: Record<string, string>) => `/painel/auditoria?${new URLSearchParams({ ...(outcome && { outcome }), ...next })}`;
  return (
    <>
      <PageHeader eyebrow="Governança" title="Auditoria" description="Quem alterou o quê, quando e de onde. Os registros não podem ser editados nem apagados." />
      <div className="flex flex-wrap gap-2">{outcomes.map(([value, label]) => <Link key={value} href={value ? `/painel/auditoria?outcome=${value}` : '/painel/auditoria'} className={`rounded-full border px-4 py-1.5 text-sm font-medium ${value === outcome ? 'border-brand bg-brand text-brand-fg' : 'border-slate-200 bg-surface'}`}>{label}</Link>)}</div>
      <div className="card mt-6 overflow-x-auto">
        {data.items.length ? (
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-5 py-3">Quando</th><th className="px-5 py-3">Quem</th><th className="px-5 py-3">Ação</th><th className="px-5 py-3">Resultado</th><th className="px-5 py-3">Origem</th></tr></thead>
            <tbody className="divide-y divide-slate-200">
              {data.items.map(row => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-500">{formatDateTime(row.createdAt)}</td>
                  <td className="px-5 py-3">{row.actor?.name ?? <span className="text-slate-400">Sem usuário</span>}<p className="text-xs text-slate-400">{row.actor?.email ?? (typeof row.metadata?.email === 'string' ? row.metadata.email : '')}</p></td>
                  <td className="px-5 py-3 font-mono text-xs">{row.action}{row.entityId && <p className="text-slate-400">{row.entity} · {row.entityId.slice(0, 8)}</p>}</td>
                  <td className="px-5 py-3"><span className={`badge ${outcomeStyle[row.outcome]}`}>{outcomeLabel[row.outcome]}</span>{row.statusCode && <span className="ml-2 text-xs text-slate-400">{row.statusCode}</span>}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{row.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState title="Nenhum registro encontrado" description="As alterações feitas no painel aparecem aqui." />}
      </div>
      {pages > 1 && <nav className="mt-6 flex justify-center gap-4 text-sm">{page > 1 && <Link href={href({ page: String(page - 1) })}>← Anterior</Link>}<span className="text-slate-500">Página {page} de {pages}</span>{page < pages && <Link href={href({ page: String(page + 1) })}>Próxima →</Link>}</nav>}
    </>
  );
}
