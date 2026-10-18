import { BlingImport } from '../../../../components/admin/bling-import';
import { BlingStockPanel } from '../../../../components/admin/bling-stock-panel';
import { formatDateTime } from '../../../../lib/admin/labels';
import { adminFetch } from '../../../../lib/admin/session';
import type { BlingStatus, BlingSyncRow } from '../../../../lib/admin/types';
import { formatPrice } from '../../../../lib/format';
import { connectBlingAction, disconnectBlingAction, resendBlingOrderAction, setAutomaticBlingInvoiceAction } from '../../actions';

export const dynamic = 'force-dynamic';
const tone = { SENT: 'bg-emerald-100 text-emerald-800', PENDING: 'bg-slate-100 text-slate-700', PROCESSING: 'bg-blue-100 text-blue-800', FAILED: 'bg-red-100 text-red-800' } as const;
const label = { SENT: 'Enviado', PENDING: 'Na fila', PROCESSING: 'Processando', FAILED: 'Com erro' } as const;

export default async function BlingPage({ searchParams }: { searchParams: Promise<{ conectado?: string; erro?: string }> }) {
  const params = await searchParams;
  const status = await adminFetch<BlingStatus>('/bling/status');
  const sync = status.connected ? await adminFetch<{ items: BlingSyncRow[] }>('/bling/orders').catch(() => ({ items: [] as BlingSyncRow[] })) : { items: [] as BlingSyncRow[] };
  return (
    <>
      <h1 className="text-3xl font-bold">Bling — canal de e-commerce</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">A STOREOS é o canal de vendas; o Bling continua sendo o ERP principal. Cada pedido mantém seu número STOREOS e recebe, separadamente, o número e o ID do Bling.</p>
      {params.conectado && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Bling conectado com sucesso.</p>}
      {params.erro && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">Não foi possível concluir a conexão. Tente de novo pelo botão abaixo.</p>}

      {!status.connected && <p className="mt-4 rounded-xl bg-violet-50 p-3 text-sm text-violet-900">Para escolher e importar produtos do Bling, conecte a conta abaixo. Depois de conectar, a lista dos seus produtos aparece aqui mesmo, com caixinhas para marcar.</p>}
      <section className="card mt-6 p-6">
        <h2 className="text-lg font-bold">Conexão</h2>
        {!status.appConfigured && (
          <div className="mt-3 space-y-2 text-sm text-slate-600">
            <p>Antes de conectar, crie um app privado na Central de Extensões → Área do Integrador. Escolha a categoria E-commerce se disponível (categoria é classificação comercial; não altera permissões nem a API). O Bling continua sendo o ERP. Conceda somente os escopos necessários: dados básicos da empresa, leitura de produtos/categorias/estoque, leitura e criação de contatos e pedidos de venda; escopos de NF-e somente se for usar emissão. Alterar escopos revoga autorizações existentes, então será preciso reconectar. Cadastre no Render as variáveis <code>BLING_CLIENT_ID</code> e <code>BLING_CLIENT_SECRET</code>.</p>
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
          <section id="importar" className="card mt-6 scroll-mt-6 p-6">
            <h2 className="text-lg font-bold">Escolher e importar produtos do Bling</h2>
            <p className="mb-4 mt-1 text-sm text-slate-500">Importação sob demanda do catálogo ativo do Bling para a loja: variações, preço, estoque, imagens e categorias. O SKU faz a reconciliação. Esta versão não sincroniza alterações do catálogo em tempo real; importe novamente após mudanças no ERP.</p>
            <BlingImport initial={status.import} codeFrom={status.productCodeFrom ?? 1500} />
          </section>
          <section className="card mt-6 p-6">
            <h2 className="text-lg font-bold">Atualizações do Bling por webhook</h2>
            <p className="mt-1 text-sm text-slate-500">Use esta URL na configuração de servidores do aplicativo Bling. A assinatura é validada com o Client Secret e cada evento é associado à empresa autorizada.</p>
            <div className="mt-4 rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">URL do servidor</p>
              <code className="mt-1 block break-all text-sm">{status.webhookUrl ?? 'Defina API_PUBLIC_URL no serviço API do Render'}</code>
            </div>
            <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-slate-600">
              <li>Na aba Webhooks do app Bling, adicione este endpoint com alias STOREOS.</li>
              <li>Ative somente Pedido de Venda → criado e atualizado → versão 1. Esses são os eventos tratados atualmente.</li>
              <li>O endpoint valida X-Bling-Signature-256, registra eventId de forma idempotente e responde antes do processamento em fila.</li>
              <li>Produtos e estoque são importados sob demanda pelo botão abaixo; não ative webhooks desses recursos ainda. A situação do Bling aparece separada e não altera automaticamente o status local.</li>
            </ol>
            {!status.companyLinked && <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">A empresa ainda não foi vinculada para roteamento dos webhooks. Inclua a permissão de leitura de dados da empresa no app Bling e reconecte.</p>}
          </section>


          <section className="card mt-6 p-6">
            <h2 className="text-lg font-bold">Conferência e estoque</h2>
            <p className="mb-4 mt-1 text-sm text-slate-500">O Bling é a fonte do estoque. Com a sincronização ligada, cada venda ou ajuste de estoque no Bling chega à loja na hora, e as vendas do site baixam no Bling logo após o pagamento; a cada 10 minutos tudo é conferido de novo. Produto com estoque zero sai da vitrine até voltar a ter saldo. Saldos de produtos com pedido pago ainda não enviado ao Bling, e abaixo do reservado, são preservados.</p>
            <BlingStockPanel enabled={status.stockSync.enabled} syncedAt={status.stockSync.syncedAt} error={status.stockSync.error} />
          </section>

          <section className="card mt-6 p-6">
            <h2 className="text-lg font-bold">Notas fiscais</h2>
            <p className="mt-1 text-sm text-slate-500">A NF-e é gerada a partir do pedido de venda no Bling, preservando o vínculo entre os dois sistemas. A emissão automática inicia somente para pedidos pagos e exige que a configuração fiscal esteja pronta no ERP.</p>
            <form action={setAutomaticBlingInvoiceAction} className="mt-4 rounded-xl border border-slate-200 p-4">
              <input type="hidden" name="enabled" value={status.automaticInvoiceEnabled ? 'false' : 'true'} />
              {status.automaticInvoiceEnabled ? <><p className="text-sm font-medium text-emerald-800">Emissão automática ativa para novos pedidos pagos.</p><button className="mt-3 text-sm text-red-700 underline">Desativar emissão automática</button></> : <>
                <label className="flex items-start gap-2 text-sm text-slate-700"><input required type="checkbox" name="fiscalConfirmed" className="mt-1" /><span>Confirmo que regras fiscais, série, natureza da operação, certificado e dados fiscais estão configurados e testados no Bling.</span></label>
                <button className="button mt-3">Ativar emissão automática</button>
              </>}
            </form>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-slate-500"><tr><th className="py-2 pr-3">Pedido STOREOS</th><th className="py-2 pr-3">NF-e</th><th className="py-2 pr-3">Status</th><th className="py-2">Detalhe</th></tr></thead>
                <tbody className="divide-y">{status.invoices.map(invoice => <tr key={invoice.id}><td className="py-2 pr-3">{invoice.orderNumber ?? invoice.orderId}</td><td className="py-2 pr-3">{invoice.invoiceNumber ? `#${invoice.invoiceNumber}${invoice.series ? ` · série ${invoice.series}` : ''}` : '—'}</td><td className="py-2 pr-3">{({ QUEUED: 'Na fila', PROCESSING: 'Processando', GENERATED: 'Gerada / aguardando SEFAZ', AUTHORIZED: 'Autorizada', REJECTED: 'Rejeitada', FAILED: 'Com erro' } as Record<string, string>)[invoice.status]}</td><td className="py-2 text-xs text-slate-500">{invoice.rejectionReason ?? (invoice.accessKey ? `Chave ${invoice.accessKey}` : '—')}</td></tr>)}</tbody>
              </table>
              {!status.invoices.length && <p className="py-5 text-center text-sm text-slate-500">Nenhuma nota fiscal solicitada ainda.</p>}
            </div>
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
