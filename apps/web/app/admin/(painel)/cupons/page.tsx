import { CouponForm } from '../../../../components/admin/coupon-form';
import { formatDateTime } from '../../../../lib/admin/labels';
import { adminFetch } from '../../../../lib/admin/session';
import Link from 'next/link';
import { getCategories } from '../../../../lib/api';
import { buildTree, flatten } from '../../../../lib/category-tree';
import type { AdminCoupon, CouponCampaign } from '../../../../lib/admin/types';
import { formatPrice } from '../../../../lib/format';
import { toggleCampaignAction, toggleCouponAction } from '../../actions';

export const dynamic = 'force-dynamic';

const describe = (c: Pick<AdminCoupon, 'type' | 'value'>) => c.type === 'PERCENT' ? `${Number(c.value)}% de desconto` : c.type === 'FIXED' ? `${formatPrice(c.value)} de desconto` : 'Frete grátis';

export default async function CouponsPage() {
  const [coupons, campaigns, categories] = await Promise.all([adminFetch<AdminCoupon[]>('/coupons'), adminFetch<CouponCampaign[]>('/coupons/campaigns'), getCategories().then(c => flatten(buildTree(c)))]);
  const categoryName = new Map(categories.map(c => [c.id, c.name]));
  return (
    <>
      <h1 className="text-3xl font-bold">Cupons</h1>
      <p className="mt-1 text-sm text-slate-500">Crie códigos de desconto para campanhas. O valor é sempre conferido no servidor ao fechar o pedido.</p>
      <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
        <section className="card h-fit p-6"><h2 className="mb-4 text-lg font-bold">Novo cupom</h2><CouponForm categories={categories.map(c => ({ id: c.id, name: c.name, depth: c.depth }))} /></section>
        <section className="card overflow-hidden">
          {coupons.length === 0 ? <p className="p-8 text-center text-slate-500">Nenhum cupom ainda.</p> : (
            <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Código</th><th>Regra</th><th>Usos</th><th>Vendas pagas</th><th>Validade</th><th /></tr></thead>
              <tbody className="divide-y">{coupons.map(c => (
                <tr key={c.id} className={c.active ? '' : 'opacity-60'}>
                  <td className="px-5 py-3 font-mono font-semibold">{c.code}</td>
                  <td>{describe(c)}{c.minSubtotal && <span className="block text-xs text-slate-400">mín. {formatPrice(c.minSubtotal)}</span>}{c.firstOrderOnly && <span className="block text-xs text-slate-400">só primeira compra</span>}{c.categoryIds.length > 0 && <span className="block text-xs text-slate-400">só em: {c.categoryIds.map(id => categoryName.get(id) ?? '—').join(', ')}</span>}</td>
                  <td>{c.usedCount}{c.maxUses ? ` / ${c.maxUses}` : ''}</td>
                  <td>{c.stats.paidOrders > 0 ? <>{formatPrice(c.stats.revenue)}<span className="block text-xs text-slate-400">{c.stats.paidOrders} pedido(s), {formatPrice(c.stats.discount)} de desconto</span></> : <span className="text-xs text-slate-400">—</span>}</td>
                  <td className="text-xs text-slate-500">{c.endsAt ? `até ${formatDateTime(c.endsAt)}` : 'Sem prazo'}</td>
                  <td className="px-5 text-right"><form action={toggleCouponAction}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="active" value={String(!c.active)} /><button className="text-xs underline">{c.active ? 'Desativar' : 'Ativar'}</button></form></td>
                </tr>))}</tbody></table>)}
        </section>
      </div>
      {campaigns.length > 0 && (
        <section className="card mt-8 overflow-hidden">
          <h2 className="px-5 pt-5 text-lg font-bold">Campanhas com códigos únicos</h2>
          <table className="mt-3 w-full text-sm"><thead className="text-left text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Campanha</th><th>Regra</th><th>Códigos usados</th><th>Vendas pagas</th><th /></tr></thead>
            <tbody className="divide-y">{campaigns.map(c => (
              <tr key={c.name} className={c.active ? '' : 'opacity-60'}>
                <td className="px-5 py-3 font-semibold"><Link href={`/painel/cupons/campanha?nome=${encodeURIComponent(c.name)}`} className="underline">{c.name}</Link></td>
                <td>{describe(c)}</td>
                <td>{c.used} de {c.total}</td>
                <td>{c.paidOrders > 0 ? <>{formatPrice(c.revenue)}<span className="block text-xs text-slate-400">{c.paidOrders} pedido(s), {formatPrice(c.discount)} de desconto</span></> : <span className="text-xs text-slate-400">—</span>}</td>
                <td className="px-5 text-right"><form action={toggleCampaignAction}><input type="hidden" name="name" value={c.name} /><input type="hidden" name="active" value={String(!c.active)} /><button className="text-xs underline">{c.active ? 'Desativar todos' : 'Ativar todos'}</button></form></td>
              </tr>))}</tbody></table>
        </section>)}
    </>
  );
}
