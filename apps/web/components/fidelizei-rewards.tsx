'use client';
import Link from 'next/link';
import { rewardLabel, type FidelizeiLoyalty, type ReservedReward } from '../lib/account/types';
import { formatPrice } from '../lib/format';

type Props = { loyalty: FidelizeiLoyalty | null; reward?: ReservedReward; amount: number; base: number; busy: boolean; error?: string; couponActive: boolean; onUse: (rewardId: string) => void; onRemove: () => void };

/** No resumo do checkout: troca pontos do Fidelizei por desconto (só para quem entrou na conta e participa). */
export function FidelizeiRewards({ loyalty, reward, amount, base, busy, error, couponActive, onUse, onRemove }: Props) {
  if (!loyalty?.enabled) return null;
  if (!loyalty.enrolled) return <p className="mt-3 text-xs text-slate-500">Ganhe pontos nesta compra: <Link href="/conta" className="font-semibold text-brand underline">participe do programa</Link> em Minha conta.</p>;
  if (reward) return (
    <div className="mt-3 text-sm text-emerald-700">
      <div className="flex justify-between gap-3"><span>{reward.rewardName} <button type="button" onClick={onRemove} disabled={busy} className="underline disabled:opacity-60">remover</button></span><span className="shrink-0">− {formatPrice(amount)}</span></div>
      <p className="mt-1 text-xs text-slate-500">{reward.pointsDebited.toLocaleString('pt-BR')} pontos reservados até {new Date(reward.reservationExpiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. Vale para Pix ou cartão.</p>
    </div>
  );
  if (!loyalty.available) return null;
  const usable = loyalty.rewards.filter(r => r.canRedeem);
  return (
    <div className="mt-4 border-t pt-4">
      <p className="text-sm font-semibold">Usar meus pontos <span className="font-normal text-slate-500">· saldo {(loyalty.balance ?? 0).toLocaleString('pt-BR')}</span></p>
      {usable.length === 0 ? <p className="mt-1 text-xs text-slate-500">Ainda não há benefício disponível para o seu saldo.</p> : (
        <ul className="mt-2 grid gap-2">{usable.map(r => {
          const short = r.minimumOrderCents > 0 && base * 100 < r.minimumOrderCents;
          return <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-2 text-sm">
            <span className="min-w-0"><span className="block truncate font-medium">{r.name}</span><span className="block text-xs text-slate-500">{rewardLabel(r)} · {r.pointsCost.toLocaleString('pt-BR')} pts{short ? ` · pedido mínimo ${formatPrice(r.minimumOrderCents / 100)}` : ''}</span></span>
            <button type="button" onClick={() => onUse(r.id)} disabled={busy || short || couponActive} className="button-ghost shrink-0 text-xs disabled:opacity-50">Usar</button>
          </li>;
        })}</ul>
      )}
      {couponActive && usable.length > 0 && <p className="mt-2 text-xs text-slate-500">Remova o cupom para usar pontos: vale um desconto por vez.</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
