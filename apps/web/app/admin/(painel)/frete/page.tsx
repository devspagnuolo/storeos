import { OrderAutomation } from '../../../../components/admin/order-automation';
import { ShippingOrigin } from '../../../../components/admin/shipping-origin';
import { ShippingRuleForm } from '../../../../components/admin/shipping-rule-form';
import { adminFetch } from '../../../../lib/admin/session';
import type { CarrierStatus, OrderAutomation as AutomationSettings, ShippingRule } from '../../../../lib/admin/types';
import { formatPrice } from '../../../../lib/format';
import { deleteShippingRuleAction } from '../../actions';

export const dynamic = 'force-dynamic';

const summary = (rule: ShippingRule) => [
  rule.states.length ? rule.states.join(', ') : 'Todo o Brasil',
  formatPrice(rule.price),
  rule.freeAbove && `${rule.freeOnly ? 'só' : 'grátis'} acima de ${formatPrice(rule.freeAbove)}`,
  `${rule.minDays} a ${rule.maxDays} dias úteis`,
].filter(Boolean).join(' · ');

export default async function ShippingPage() {
  const [rules, carrier, automation] = await Promise.all([adminFetch<ShippingRule[]>('/shipping/rules'), adminFetch<CarrierStatus>('/shipping/carrier'), adminFetch<AutomationSettings>('/fulfillment/automation')]);
  return (
    <>
      <h1 className="text-3xl font-bold">Frete</h1>
      <p className="mt-2 max-w-2xl text-slate-600">O cliente vê as regras ativas que atendem o estado do CEP dele, na ordem abaixo. Sem nenhuma regra ativa, os pedidos saem sem frete e a entrega é combinada com o cliente.</p>
      <p className={`mt-4 max-w-2xl rounded-lg border p-4 text-sm ${carrier.enabled ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>{carrier.enabled ? `Cotação em tempo real (Correios via ${carrier.provider === 'superfrete' ? 'SuperFrete' : 'Melhor Envio'}) ligada, saindo do CEP ${carrier.originZip}. Os preços vêm do peso e das medidas de cada produto.` : `Cotação em tempo real (SuperFrete) desligada: ${carrier.credentials ? 'falta o CEP de origem (cadastre abaixo)' : carrier.originZip ? 'falta o token da transportadora no servidor' : 'falta o token no servidor e o CEP de origem (cadastre abaixo)'}. Por enquanto valem só as regras abaixo.`}</p>
      <ShippingOrigin carrier={carrier} />
      <OrderAutomation settings={automation} />
      <div className="mt-8 space-y-6">
        {rules.map(rule => (
          <details key={rule.id} className="card p-6">
            <summary className="flex cursor-pointer flex-wrap items-center gap-3">
              <b>{rule.name}</b>
              {!rule.active && <span className="badge bg-slate-100 text-slate-600">Inativa</span>}
              <span className="text-sm text-slate-500">{summary(rule)}</span>
            </summary>
            <div className="mt-6 border-t pt-6">
              <ShippingRuleForm rule={rule} />
              <form action={deleteShippingRuleAction} className="mt-4"><input type="hidden" name="id" value={rule.id} /><button className="text-sm font-medium text-red-700 hover:underline">Excluir regra</button></form>
            </div>
          </details>
        ))}
        <section className="card p-6">
          <h2 className="mb-4 text-lg font-bold">Nova regra</h2>
          <ShippingRuleForm />
        </section>
      </div>
    </>
  );
}
