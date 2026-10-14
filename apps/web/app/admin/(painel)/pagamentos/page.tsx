import { adminFetch } from '../../../../lib/admin/session';
import type { StoreSetup } from '../../../../lib/admin/storefront';

export const dynamic = 'force-dynamic';

export default async function PaymentsPage() {
  const { payment } = await adminFetch<StoreSetup>('/store/setup');
  const checks = [
    ['Recebimento por PIX', payment.paymentConfigured, 'Configuração da conta de recebimento detectada.'],
    ['Confirmação automática', payment.webhookConfigured && payment.callbackConfigured, 'Configuração das notificações de pagamento detectada.'],
    ['Pagamento confirmado nesta loja', payment.confirmedPayments > 0, 'Há confirmação registrada pelo Mercado Pago.'],
  ] as const;
  return <><p className="text-sm font-semibold text-brand">PAGAMENTOS</p><h1 className="mt-2 text-3xl font-bold">Recebimentos da loja</h1><p className="mt-3 max-w-2xl text-slate-600">Acompanhe a configuração do PIX. Detectar uma configuração não confirma que a conta está válida; valide o fluxo com uma compra de teste.</p>
    <div className="card mt-8 divide-y px-6">{checks.map(([title, ready, description]) => <section key={title} className="py-5"><div className="flex items-center justify-between gap-4"><h2 className="font-semibold">{title}</h2><span className={'rounded-full px-3 py-1 text-xs font-semibold ' + (ready ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800')}>{ready ? 'Detectado' : 'Pendente'}</span></div><p className="mt-2 text-sm text-slate-500">{ready ? description : 'Requer configuração ou validação antes de operar.'}</p></section>)}</div>
    <section className="card mt-6 p-6"><h2 className="font-bold">Como validar</h2><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600"><li>Confira a conta de recebimento com o responsável pela operação.</li><li>Faça uma compra de teste e verifique se o PIX é gerado corretamente.</li><li>Após a confirmação do pagamento, confira o status do pedido e o saldo na conta de recebimento.</li></ol><p className="mt-4 text-sm text-slate-500">A conexão financeira atual é gerenciada pela operação da plataforma. A conexão individual de contas por lojista será uma etapa específica da expansão SaaS.</p></section></>;
}
