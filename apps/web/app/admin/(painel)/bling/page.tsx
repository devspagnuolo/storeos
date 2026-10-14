import { BlingImport } from '../../../../components/admin/bling-import';
import { formatDateTime } from '../../../../lib/admin/labels';
import { adminFetch } from '../../../../lib/admin/session';
import type { BlingStatus, BlingSyncRow } from '../../../../lib/admin/types';
import { formatPrice } from '../../../../lib/format';
import { connectBlingAction, disconnectBlingAction, resendBlingOrderAction } from '../../actions';

export const dynamic = 'force-dynamic';
const tone = { SENT: 'bg-emerald-100 text-emerald-800', PENDING: 'bg-slate-100 text-slate-700', PROCESSING: 'bg-blue-100 text-blue-800', FAILED: 'bg-red-100 text-red-800' } as const;
const label = { SENT: 'Enviado', PENDING: 'Na fila', PROCESSING: 'Processando', FAILED: 'Com erro' } as const;

export default async function BlingPage({ searchParams }: { searchParams: Promise<{ conectado?: string; erro?: string }> }) {
  const params = await searchParams;
  const status = await adminFetch<BlingStatus>('/bling/status');
  const sync = status.connected ? await adminFetch<{ items: BlingSyncRow[] }>('/bling/orders').catch(() => ({ items: [] as BlingSyncRow[] })) : { items: [] as BlingSyncRow[] };
  return (
    <>
      <h1 className="text-3xl font-bold">Bling (ERP)</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">O Bling é o sistema principal da operação. Os pedidos do site — inclusive aguardando pagamento — são registrados lá com o número STOREOS; situação e número do ERP retornam para este painel.</p>
      {params.conectado && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Bling conectado com sucesso.</p>}
      {params.erro && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">Não foi possível concluir a conexão. Tente de novo pelo botão abaixo.</p>}

      <section className="card mt-6 p-6">
        <h2 className="text-lg font-bold">Conexão</h2>
        {!status.appConfigured && (
          <div className="mt-3 space-y-2 text-sm text-slate-600">
            <p>Antes de conectar, crie um aplicativo no Bling (Preferências → Integrações → Cadastro de aplicativos) e cadastre na API as variáveis <code>BLING_CLIENT_ID</code> e <code>BLING_CLIENT_SECRET</code>.</p>
            <p>No cadastro do aplicativo, informe como <b>link de redirecionamento</b>: <code className="break-all rounded bg-slate-100 px-1">{status.callbackUrl ?? 'https://SUA-API/api/v1/bling/callback (defina API_PUBLIC_URL)'}</code></p>
          </div>
        )}
        {status.appConfigured && !status.connected && (
          <form action={connectBlingAction} className="mt-3"><button className="button">Conectar ao Bling</button></form>
        )}
        {status.connected && (
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            <span className="badge bg-emerald-100 text-emerald-800">Conectado</span>
            <span className="text-slate-500">desde {status.connectedAt ? formatDateTime(status.connectedAt) : '—'}</span>
            <form action={disconnectBlingAction}><button className="text-xs text-red-700 underline">Desconectar</button></form>
          </div>
        )}
        {status.lastError && <p role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{status.lastError} <form action={connectBlingAction} className="inline"><button className="underline">Reconectar</button></form></p>}
      </section>

      {status.connected && (
        <>
          <section className="card mt-6 p-6">
            <h2 className="text-lg font-bold">Atualizações do Bling por webhook</h2>
            <p className="mt-1 text-sm text-slate-500">Use esta URL na configuração de servidores do aplicativo Bling. A assinatura é validada com o Client Secret e cada evento é associado à empresa autorizada.</p>
            <div className="mt-4 rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">URL do servidor</p>
              <code className="mt-1 block break-all text-sm">{status.webhookUrl ?? 'Defina API_PUBLIC_URL no serviço API do Render'}</code>
            </div>
            <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-slate-600">
              <li>Na aba Webhooks do aplicativo, adicione o servidor com alias STOREOS.</li>
              <li>Ative o recurso Pedido de venda, ações criado e atualizado, versão 1.</li>
              <li>Salve a configuração; atualizações de situação do ERP aparecerão nos detalhes do pedido.</li>
            </ol>
            {!status.companyLinked && <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">A empresa ainda não foi vinculada para roteamento dos webhooks. Inclua a permissão de leitura de dados da empresa no app Bling e reconecte.</p>}
          </section>

          <section className="card mt-6 p-6">
            <h2 className="text-lg font-bold">Importar produtos</h2>
            <p className="mb-4 mt-1 text-sm text-slate-500">Traz os produtos ativos do Bling com variações, preços, estoque, imagens e categorias. Produtos com o mesmo código (SKU) são atualizados; os novos são criados. Pode repetir quando quiser.</p>
            <BlingImport initial={status.import} />
          </section>

          <section className="card mt-6 p-6">
            <h2 className="text-lg font-bold">Pedidos enviados ao Bling</h2>
            <p className="mb-4 mt-1 text-sm text-slate-500">Cada pedido criado é enviado em segundo plano com cliente, itens, frete e número STOREOS. O número próprio do Bling e a situação do ERP ficam vinculados ao pedido; falhas são repetidas automaticamente.</p>
            <p className="mb-3 text-sm text-slate-600">{status.orders.SENT ?? 0} enviados · {(status.orders.PENDING ?? 0) + (status.orders.PROCESSING ?? 0)} na fila/processando · {status.orders.FAILED ?? 0} com erro</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-slate-500"><tr><th className="py-2 pr-4">Pedido</th><th className="py-2 pr-4">Total</th><th className="py-2 pr-4">Situação</th><th className="py-2 pr-4">No Bling</th><th className="py-2" /></tr></thead>
                <tbody className="divide-y">
                  {sync.items.map(row => (
                    <tr key={row.id}>
                      <td className="py-2 pr-4 font-medium">{row.orderNumber}</td>
                      <td className="py-2 pr-4">{formatPrice(row.total)}</td>
                      <td className="py-2 pr-4"><span className={`badge ${tone[row.status]}`}>{label[row.status]}</span>{row.lastError && row.status !== 'SENT' && <span className="mt-1 block max-w-md text-xs text-red-700">{row.lastError}</span>}</td>
                      <td className="py-2 pr-4 text-slate-500">{row.blingOrderNumber ? `Pedido #${row.blingOrderNumber}` : '—'}{row.blingOrderId && <span className="block text-xs">ID {row.blingOrderId}</span>}{row.blingSituationName && <span className="block text-xs">{row.blingSituationName}</span>}</td>
                      <td className="py-2 text-right">{row.status !== 'SENT' && row.status !== 'PROCESSING' && <form action={resendBlingOrderAction}><input type="hidden" name="number" value={row.orderNumber} /><button className="text-xs underline">Reenviar agora</button></form>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!sync.items.length && <p className="py-6 text-center text-slate-500">Nenhum pedido enviado ainda. Os pedidos pagos a partir da conexão aparecem aqui.</p>}
            </div>
          </section>
        </>
      )}
    </>
  );
}
