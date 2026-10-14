import { CouponForm } from '../../../../components/admin/coupon-form';
import { formatDateTime } from '../../../../lib/admin/labels';
import { adminFetch } from '../../../../lib/admin/session';
import type { AdminCoupon } from '../../../../lib/admin/types';
import { formatPrice } from '../../../../lib/format';
import { toggleCouponAction } from '../../actions';

export const dynamic = 'force-dynamic';

const describe = (c: AdminCoupon) => c.type === 'PERCENT' ? `${Number(c.value)}% de desconto` : c.type === 'FIXED' ? `${formatPrice(c.value)} de desconto` : 'Frete grátis';

export default async function CouponsPage() {
  const coupons = await adminFetch<AdminCoupon[]>('/coupons');
  return (
    <>
      <h1 className="text-3xl font-bold">Cupons</h1>
      <p className="mt-1 text-sm text-slate-500">Crie códigos de desconto para campanhas. O valor é sempre conferido no servidor ao fechar o pedido.</p>
      <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
        <section className="card h-fit p-6"><h2 className="mb-4 text-lg font-bold">Novo cupom</h2><CouponForm /></section>
        <section className="card overflow-hidden">
          {coupons.length === 0 ? <p className="p-8 text-center text-slate-500">Nenhum cupom ainda.</p> : (
            <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Código</th><th>Regra</th><th>Usos</th><th>Validade</th><th /></tr></thead>
              <tbody className="divide-y">{coupons.map(c => (
                <tr key={c.id} className={c.active ? '' : 'opacity-60'}>
                  <td className="px-5 py-3 font-mono font-semibold">{c.code}</td>
                  <td>{describe(c)}{c.minSubtotal && <span className="block text-xs text-slate-400">mín. {formatPrice(c.minSubtotal)}</span>}</td>
                  <td>{c.usedCount}{c.maxUses ? ` / ${c.maxUses}` : ''}</td>
                  <td className="text-xs text-slate-500">{c.endsAt ? `até ${formatDateTime(c.endsAt)}` : 'Sem prazo'}</td>
                  <td className="px-5 text-right"><form action={toggleCouponAction}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="active" value={String(!c.active)} /><button className="text-xs underline">{c.active ? 'Desativar' : 'Ativar'}</button></form></td>
                </tr>))}</tbody></table>)}
        </section>
      </div>
    </>
  );
}
