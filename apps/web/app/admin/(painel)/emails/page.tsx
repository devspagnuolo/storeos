import { adminFetch } from '../../../../lib/admin/session';
import type { EmailLogPage } from '../../../../lib/admin/types';

export const dynamic = 'force-dynamic';

const statusLabel = { SENT: 'Enviado', SIMULATED: 'Simulado', FAILED: 'Falhou' } as const;

export default async function EmailsPage() {
  const { items, total, provider } = await adminFetch<EmailLogPage>('/notifications/emails');
  return (
    <>
      <h1 className="text-3xl font-bold">E-mails</h1>
      <p className="mt-1 text-sm text-slate-500">Avisos enviados aos clientes a cada etapa do pedido: recebido, pago, enviado, entregue e cancelado.</p>
      {provider === 'simulated' && (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Nenhum provedor de e-mail configurado: as mensagens estão sendo apenas registradas aqui, sem sair de verdade. Configure a chave do provedor (Resend) para começar a enviar.</p>
      )}
      <div className="card mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs uppercase text-slate-500"><tr><th className="p-3">Quando</th><th className="p-3">Para</th><th className="p-3">Assunto</th><th className="p-3">Situação</th></tr></thead>
          <tbody>
            {items.map(mail => (
              <tr key={mail.id} className="border-b last:border-0">
                <td className="p-3 whitespace-nowrap">{new Date(mail.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
                <td className="p-3">{mail.toEmail}</td>
                <td className="p-3">{mail.subject}</td>
                <td className="p-3" title={mail.error ?? undefined}>{statusLabel[mail.status]}</td>
              </tr>))}
            {!items.length && <tr><td colSpan={4} className="p-8 text-center text-slate-500">Nenhum e-mail ainda.</td></tr>}
          </tbody>
        </table>
      </div>
      {total > items.length && <p className="mt-3 text-xs text-slate-500">Mostrando os {items.length} mais recentes de {total}.</p>}
    </>
  );
}
