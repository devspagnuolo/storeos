import { MfaPanel } from '../../../../components/admin/mfa-panel';
import { formatDateTime } from '../../../../lib/admin/labels';
import { revokeSessionAction } from '../../actions';
import { adminFetch } from '../../../../lib/admin/session';

export const dynamic = 'force-dynamic';

type SessionRow = { id: string; ip: string | null; userAgent: string | null; lastUsedAt: string | null; createdAt: string };

export default async function SecurityPage() {
  const [mfa, sessions] = await Promise.all([
    adminFetch<{ enabled: boolean; recoveryCodesLeft: number }>('/auth/mfa'),
    adminFetch<SessionRow[]>('/auth/sessions'),
  ]);
  return (
    <>
      <h1 className="text-3xl font-bold">Segurança</h1>
      <p className="mt-1 text-sm text-slate-500">Proteja seu acesso com verificação em duas etapas e acompanhe onde sua conta está conectada.</p>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="card p-6"><h2 className="mb-4 text-lg font-bold">Verificação em duas etapas</h2><MfaPanel enabled={mfa.enabled} recoveryCodesLeft={mfa.recoveryCodesLeft} /></section>
        <section className="card p-6">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">Sessões ativas</h2>
            <form action={revokeSessionAction}><input type="hidden" name="id" value="all" /><button className="button-ghost text-sm">Sair de todos</button></form></div>
          <ul className="divide-y text-sm">{sessions.map(item => (
            <li key={item.id} className="flex items-start justify-between gap-3 py-3">
              <div><p className="font-medium">{item.userAgent?.slice(0, 80) ?? 'Dispositivo desconhecido'}</p><p className="text-xs text-slate-500">{item.ip ?? 'IP desconhecido'} · atividade em {formatDateTime(item.lastUsedAt ?? item.createdAt)}</p></div>
              <form action={revokeSessionAction}><input type="hidden" name="id" value={item.id} /><button className="text-xs text-red-700 underline">Encerrar</button></form>
            </li>))}</ul>
        </section>
      </div>
    </>
  );
}
