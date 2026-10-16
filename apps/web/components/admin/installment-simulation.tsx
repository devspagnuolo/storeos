import { formatPrice } from '../../lib/format';

type Row = { installments: number; installmentAmount: number; totalAmount: number; interestFree: boolean; shown: boolean; reason: string | null };
export type Simulation = { configured: boolean; limits: { max: number; maxFree: number; minFree: number }; brands: { id: string; name: string; rows: Row[]; error?: string }[] };

/** Simulação com os planos reais da conta Mercado Pago: mostra o que o cliente vê no checkout e por quê. */
export function InstallmentSimulation({ amount, simulation }: { amount: number; simulation: Simulation | null }) {
  const brands = simulation?.brands.filter(brand => brand.rows.length) ?? [];
  const brand = brands[0];
  const freeAtMp = brand ? Math.max(1, ...brand.rows.filter(row => row.interestFree).map(row => row.installments)) : 0;
  return (
    <section className="card mt-6 p-6 text-sm">
      <h2 className="text-lg font-bold">Simular parcelamento</h2>
      <p className="mt-1 text-slate-600">Veja, para um valor de compra, o que o Mercado Pago cobra em cada parcela e o que aparece para o cliente no checkout.</p>
      <form className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block font-medium">Valor da compra (R$)
          <input name="valor" defaultValue={amount.toFixed(2).replace('.', ',')} inputMode="decimal" className="input sm:max-w-[10rem]" />
        </label>
        <button className="button-ghost">Simular</button>
      </form>
      {!simulation && <p className="mt-4 text-amber-800">Não foi possível consultar o Mercado Pago agora. Tente de novo em instantes.</p>}
      {simulation && !simulation.configured && <p className="mt-4 text-amber-800">O Mercado Pago ainda não está conectado (falta o token de acesso no servidor).</p>}
      {simulation?.configured && !brand && <p className="mt-4 text-amber-800">O Mercado Pago não devolveu planos para este valor.</p>}
      {brand && <>
        <p className={`mt-4 rounded-xl p-3 ${freeAtMp > 1 ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
          {freeAtMp > 1
            ? `Sua conta Mercado Pago oferece até ${freeAtMp}x sem juros para ${formatPrice(amount)} (${brand.name}).`
            : `Sua conta Mercado Pago cobra juros do cliente a partir de 2x. Para vender parcelado sem juros, ative o parcelamento sem juros nas configurações de custos da sua conta Mercado Pago (até ${simulation!.limits.maxFree}x, como definido acima). Esse custo passa a ser da loja.`}
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-left">
            <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2 pr-3">Parcelas</th><th className="py-2 pr-3">Valor da parcela</th><th className="py-2 pr-3">Total</th><th className="py-2">No checkout</th></tr></thead>
            <tbody className="divide-y">
              {brand.rows.map(row => (
                <tr key={row.installments}>
                  <td className="py-2 pr-3 font-medium">{row.installments}x</td>
                  <td className="py-2 pr-3">{formatPrice(row.installmentAmount)}</td>
                  <td className="py-2 pr-3">{formatPrice(row.totalAmount)} <span className={row.interestFree ? 'text-emerald-700' : 'text-slate-500'}>{row.interestFree ? 'sem juros' : 'com juros'}</span></td>
                  <td className="py-2">{row.shown ? 'Aparece' : <span className="text-slate-500">Não aparece ({row.reason})</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">Simulação para {brand.name}. Cada banco pode ter planos diferentes; o checkout sempre consulta o cartão do cliente.</p>
      </>}
    </section>
  );
}
