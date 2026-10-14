import { PromotionForm } from '../../../../components/admin/promotion-form';
import { formatDateTime } from '../../../../lib/admin/labels';
import { adminFetch } from '../../../../lib/admin/session';
import type { AdminPromotion } from '../../../../lib/admin/types';
import { formatPrice } from '../../../../lib/format';
import { deletePromotionAction, togglePromotionAction } from '../../actions';

export const dynamic = 'force-dynamic';

const describe = (p: AdminPromotion) => p.type === 'BUY_X_PAY_Y' ? `Leve ${p.buyQty} pague ${p.payQty}` : p.type === 'CART_PERCENT' ? `${Number(p.value)}% no carrinho${p.minSubtotal ? ` acima de ${formatPrice(p.minSubtotal)}` : ''}` : `${Number(p.value)}% nos produtos`;

export default async function PromotionsPage() {
  const promotions = await adminFetch<AdminPromotion[]>('/promotions');
  return (
    <>
      <h1 className="text-3xl font-bold">Promoções</h1>
      <p className="mt-1 text-sm text-slate-500">Descontos automáticos, sem código: o cliente vê o desconto no carrinho. Em cada produto vale a melhor promoção; o desconto de carrinho vem depois, e o cupom por último.</p>
      <div className="mt-8 grid gap-6 lg:grid-cols-[400px_1fr]">
        <section className="card h-fit p-6"><h2 className="mb-4 text-lg font-bold">Nova promoção</h2><PromotionForm /></section>
        <section className="card overflow-hidden">
          {promotions.length === 0 ? <p className="p-8 text-center text-slate-500">Nenhuma promoção ainda.</p> : (
            <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Promoção</th><th>Regra</th><th>Validade</th><th /></tr></thead>
              <tbody className="divide-y">{promotions.map(p => (
                <tr key={p.id} className={p.active ? '' : 'opacity-60'}>
                  <td className="px-5 py-3 font-semibold">{p.name}{p.skus.length > 0 && <span className="block font-mono text-xs font-normal text-slate-400">{p.skus.join(', ')}</span>}</td>
                  <td>{describe(p)}</td>
                  <td className="text-xs text-slate-500">{p.endsAt ? `até ${formatDateTime(p.endsAt)}` : 'Sem prazo'}</td>
                  <td className="px-5 text-right">
                    <form action={togglePromotionAction} className="inline"><input type="hidden" name="id" value={p.id} /><input type="hidden" name="active" value={String(!p.active)} /><button className="text-xs underline">{p.active ? 'Pausar' : 'Ativar'}</button></form>
                    <form action={deletePromotionAction} className="ml-3 inline"><input type="hidden" name="id" value={p.id} /><button className="text-xs text-red-700 underline">Excluir</button></form>
                  </td>
                </tr>))}</tbody></table>)}
        </section>
      </div>
    </>
  );
}
