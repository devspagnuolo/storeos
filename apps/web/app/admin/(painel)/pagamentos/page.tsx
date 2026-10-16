import { adminFetch } from '../../../../lib/admin/session';
import type { StoreSetup } from '../../../../lib/admin/storefront';
import { InstallmentSimulation, type Simulation } from '../../../../components/admin/installment-simulation';
import { PaymentRulesForm, type PaymentRules } from '../../../../components/admin/payment-rules-form';

export const dynamic = 'force-dynamic';

type PaymentConfig = {
  card: null | {
    provider: 'mercadopago';
    maxInstallments: number;
    maxFreeInstallments: number;
  };
  boleto: boolean;
};

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ valor?: string }> }) {
  const typed = Number(String((await searchParams).valor ?? '').replace(/\./g, '').replace(',', '.'));
  const amount = Number.isFinite(typed) && typed >= 1 && typed <= 1_000_000 ? Math.round(typed * 100) / 100 : 300;
  const [{ payment }, paymentConfig, rules] = await Promise.all([
    adminFetch<StoreSetup>('/store/setup'),
    adminFetch<PaymentConfig>('/payments/config'),
    adminFetch<PaymentRules>('/payments/rules'),
  ]);
  const simulation = paymentConfig.card ? await adminFetch<Simulation>(`/payments/rules/simulation?amount=${amount}`).catch(() => null) : null;
  const checks = [
    ['PIX', payment.paymentConfigured, 'Configuração da conta de recebimento detectada.'],
    ['Cartão de crédito', Boolean(paymentConfig.card), paymentConfig.card ? 'Gateway de cartão disponível no checkout.' : 'Configure um gateway compatível para habilitar cartão.'],
    ['Boleto bancário', paymentConfig.boleto, paymentConfig.boleto ? 'Mercado Pago configurado para emissão de boleto.' : 'Disponível quando a integração Mercado Pago está configurada.'],
    ['Confirmação automática', payment.webhookConfigured && payment.callbackConfigured, 'Configuração das notificações de pagamento detectada.'],
    ['Pagamento confirmado nesta loja', payment.confirmedPayments > 0, 'Há confirmação registrada pelo Mercado Pago.'],
  ] as const;

  return <>
    <p className="text-sm font-semibold text-brand">PAGAMENTOS</p>
    <h1 className="mt-2 text-3xl font-bold">Recebimentos da loja</h1>
    <p className="mt-3 max-w-2xl text-slate-600">Confira os meios habilitados e os limites de parcelamento do checkout. A presença de credenciais não substitui uma compra de homologação.</p>
    <div className="card mt-8 divide-y px-6">{checks.map(([title, ready, description]) => <section key={title} className="py-5"><div className="flex items-center justify-between gap-4"><h2 className="font-semibold">{title}</h2><span className={'rounded-full px-3 py-1 text-xs font-semibold ' + (ready ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800')}>{ready ? 'Detectado' : 'Pendente'}</span></div><p className="mt-2 text-sm text-slate-500">{ready ? description : 'Requer configuração ou validação antes de operar.'}</p></section>)}</div>
    {paymentConfig.card && <PaymentRulesForm rules={rules} />}
    {paymentConfig.card && <InstallmentSimulation amount={amount} simulation={simulation} />}
    <section className="card mt-6 p-6"><h2 className="font-bold">Como homologar com segurança</h2><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600"><li>Use credenciais e cartões de teste do Mercado Pago para validar cartão, parcelas, boleto e notificações; não faça uma cobrança real para testar credenciais de teste.</li><li>Confira na conta Mercado Pago se as parcelas sem juros desejadas estão habilitadas e compare a simulação para cartões diferentes.</li><li>Antes de vender, troque para credenciais de produção, configure os webhooks e faça uma transação real de baixo valor com autorização operacional.</li><li>Para frete, confira o CEP de origem em Configurações da loja e teste CEPs de destino; a API recalcula as opções e os valores na criação do pedido.</li></ol><p className="mt-4 text-sm text-slate-500">A conexão financeira atual é gerenciada pela operação da plataforma. A conexão individual de contas por lojista será uma etapa específica da expansão SaaS.</p></section>
  </>;
}
