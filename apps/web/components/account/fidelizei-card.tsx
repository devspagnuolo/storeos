'use client';
import { useActionState } from 'react';
import { enrollFidelizeiAction, type EnrollState } from '../../app/conta/actions';
import { rewardLabel, type FidelizeiLoyalty } from '../../lib/account/types';
import { formatPrice } from '../../lib/format';

/** Programa de pontos Fidelizei em Minha conta: adesão com aceite, saldo e benefícios para usar no checkout. */
export function FidelizeiCard({ loyalty }: { loyalty: Exclude<FidelizeiLoyalty, { enabled: false }> }) {
  const [state, action, pending] = useActionState<EnrollState, FormData>(enrollFidelizeiAction, {});
  if (!loyalty.enrolled) return (
    <section aria-labelledby="fidelizei" className="card p-5">
      <h2 id="fidelizei" className="text-lg font-bold">Programa de pontos</h2>
      <p className="mt-2 text-sm text-slate-600">Ganhe pontos nas compras e troque por desconto aqui na loja. Os pontos ficam no Fidelizei, ligados ao seu CPF.</p>
      <form action={action} className="mt-4 grid gap-3">
        {!loyalty.hasDocument && <label className="text-sm font-medium">CPF<input name="cpf" inputMode="numeric" required placeholder="000.000.000-00" autoComplete="off" className="input mt-1" /></label>}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="consent" required className="mt-1" />
          <span>Quero participar e aceito os {loyalty.termsUrl ? <a href={loyalty.termsUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline">termos do programa</a> : 'termos do programa'} e a {loyalty.privacyUrl ? <a href={loyalty.privacyUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline">política de privacidade</a> : 'política de privacidade'}.</span>
        </label>
        <button disabled={pending} className="button disabled:opacity-60">{pending ? 'Enviando…' : 'Participar'}</button>
        {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      </form>
    </section>
  );
  return (
    <section aria-labelledby="fidelizei" className="card p-5">
      <h2 id="fidelizei" className="text-lg font-bold">Meus pontos</h2>
      {!loyalty.available ? <p className="mt-2 text-sm text-slate-500">Não conseguimos consultar seu saldo agora. Tente de novo em instantes.</p> : <>
        <p className="mt-2 text-sm text-slate-600">Saldo de <strong>{(loyalty.balance ?? 0).toLocaleString('pt-BR')} pontos</strong>. Os pontos das compras entram depois que o pedido é faturado.</p>
        {loyalty.rewards.length > 0 && <ul className="mt-3 divide-y text-sm">{loyalty.rewards.map(reward => <li key={reward.id} className="py-2">
          <div className="flex items-start justify-between gap-3"><span className="font-medium">{reward.name}</span><b className={reward.canRedeem ? 'shrink-0 text-emerald-700' : 'shrink-0 text-slate-400'}>{reward.pointsCost.toLocaleString('pt-BR')} pts</b></div>
          <p className="text-xs text-slate-500">{rewardLabel(reward)}{reward.minimumOrderCents > 0 ? ` em pedidos a partir de ${formatPrice(reward.minimumOrderCents / 100)}` : ''}{reward.canRedeem ? ' · use no checkout' : ''}</p>
        </li>)}</ul>}
      </>}
    </section>
  );
}
