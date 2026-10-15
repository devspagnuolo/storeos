import { CartRemind } from '../../../../components/admin/cart-remind';
import { formatDateTime } from '../../../../lib/admin/labels';
import { adminFetch } from '../../../../lib/admin/session';
import type { AbandonedCartList } from '../../../../lib/admin/types';
import { formatPrice } from '../../../../lib/format';

export const dynamic = 'force-dynamic';

const STATUS = {
  OPEN: ['Aguardando prazo', 'bg-slate-100 text-slate-700'], REMINDED: ['Lembrete enviado', 'bg-amber-100 text-amber-800'],
  RECOVERED: ['Virou pedido', 'bg-emerald-100 text-emerald-800'], OPTED_OUT: ['Não quer lembretes', 'bg-slate-200 text-slate-600'],
} as const;

export default async function AbandonedCartsPage() {
  const { items, stats, delayMinutes, siteConfigured } = await adminFetch<AbandonedCartList>('/abandoned-carts/admin?pageSize=100');
  const cards = [['Esperando o prazo', String(stats.open)], ['Lembretes enviados', String(stats.reminded)], ['Viraram pedido', String(stats.recovered)], ['Valor recuperado', formatPrice(stats.recoveredValue)]];
  return (
    <>
      <h1 className="text-3xl font-bold">Carrinhos abandonados</h1>
      <p className="mt-1 text-sm text-slate-500">Quem informou o e-mail no checkout e não terminou a compra recebe um lembrete depois de {delayMinutes} minutos parado, uma única vez. Se a pessoa comprar, o carrinho sai da fila sozinho.</p>
      {!siteConfigured && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Os lembretes não saem enquanto o endereço público da loja não estiver configurado. Ative um domínio próprio em Domínios ou defina PUBLIC_SITE_URL na API.</p>}
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        {cards.map(([label, value]) => <div key={label} className="card p-4"><p className="text-xs uppercase text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>)}
      </div>
      <p className="mt-3 text-xs text-slate-500">Ainda em aberto (aguardando ou lembrados): {formatPrice(stats.pendingValue)}. “Valor recuperado” soma os produtos dos carrinhos que viraram pedido (sem frete e desconto).</p>
      <div className="card mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs uppercase text-slate-500"><tr><th className="p-3">Cliente</th><th className="p-3">Itens</th><th className="p-3">Valor</th><th className="p-3">Última atividade</th><th className="p-3">Situação</th><th className="p-3" /></tr></thead>
          <tbody>
            {items.map(cart => {
              const [label, tone] = STATUS[cart.status];
              return (
                <tr key={cart.id} className="border-b align-top last:border-0">
                  <td className="p-3"><p className="font-medium">{cart.name ?? '—'}</p><p className="text-xs text-slate-500">{cart.email}</p></td>
                  <td className="p-3"><ul className="space-y-0.5">{cart.items.map((item, index) => <li key={index}>{item.quantity}x {item.name}{item.variantLabel ? ` (${item.variantLabel})` : ''}</li>)}</ul></td>
                  <td className="p-3 whitespace-nowrap">{formatPrice(cart.subtotal)}</td>
                  <td className="p-3 whitespace-nowrap">{formatDateTime(cart.lastActivityAt)}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>{label}</span>{cart.remindedAt && <p className="mt-1 text-xs text-slate-500">{formatDateTime(cart.remindedAt)}</p>}</td>
                  <td className="p-3">{cart.status !== 'RECOVERED' && cart.status !== 'OPTED_OUT' && <CartRemind id={cart.id} again={cart.status === 'REMINDED'} />}</td>
                </tr>
              );
            })}
            {!items.length && <tr><td colSpan={6} className="p-8 text-center text-slate-500">Nenhum carrinho guardado ainda. Eles aparecem quando alguém digita o e-mail no checkout.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
