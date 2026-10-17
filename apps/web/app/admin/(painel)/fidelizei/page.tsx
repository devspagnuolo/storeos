import { FidelizeiSettingsForm } from '../../../../components/admin/fidelizei-settings-form';
import { formatDateTime } from '../../../../lib/admin/labels';
import { adminFetch } from '../../../../lib/admin/session';
import type { FidelizeiRedemptionRow, FidelizeiRedemptionStatus, FidelizeiSettings } from '../../../../lib/admin/types';
import { formatPrice } from '../../../../lib/format';
import { disconnectFidelizeiAction } from '../../actions';

export const dynamic = 'force-dynamic';

const STATUS: Record<FidelizeiRedemptionStatus, [string, string]> = {
  RESERVED: ['Aguardando Bling', 'bg-amber-50 text-amber-800'],
  CONFIRMED: ['Confirmado', 'bg-emerald-50 text-emerald-700'],
  CANCELLED: ['Pontos devolvidos', 'bg-slate-100 text-slate-600'],
  EXPIRED: ['Expirado', 'bg-slate-100 text-slate-600'],
  FAILED: ['Precisa de atenção', 'bg-red-50 text-red-700'],
};

export default async function FidelizeiPage() {
  const [settings, redemptions] = await Promise.all([adminFetch<FidelizeiSettings>('/fidelizei/settings'), adminFetch<FidelizeiRedemptionRow[]>('/fidelizei/redemptions').catch(() => [])]);
  return <>
    <p className="text-sm font-semibold text-brand">FIDELIDADE</p>
    <h1 className="mt-2 text-3xl font-bold">Fidelizei</h1>
    <p className="mt-3 max-w-2xl text-slate-600">O Fidelizei cuida dos pontos e das regras. A cliente adere em Minha conta, vê o saldo e troca pontos por desconto no checkout (Pix ou cartão). Os pontos das compras entram quando o pedido chega ao Fidelizei pelo Bling, com o mesmo CPF.</p>
    <p className="mt-2 max-w-2xl text-sm text-slate-500">Com o Fidelizei ativo, a área da cliente mostra só os pontos dele. Para não dar pontos em dobro, desligue o programa próprio em Marketing → Fidelidade (pontos).</p>

    <section className="card mt-8 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Conexão</h2>
        <span className={'rounded-full px-3 py-1 text-xs font-semibold ' + (settings.connected && !settings.lastError ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800')}>{!settings.connected ? 'Não conectado' : settings.lastError ? 'Com erro' : settings.enabled ? 'Ativo na loja' : 'Conectado, desligado na loja'}</span>
      </div>
      {settings.lastError && <p role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{settings.lastError}</p>}
      {settings.checkedAt && <p className="mt-2 text-xs text-slate-500">Última verificação: {formatDateTime(settings.checkedAt)} · {settings.members} cliente(s) aderiram pela loja</p>}
      <div className="mt-5"><FidelizeiSettingsForm settings={settings} /></div>
      {settings.connected && <form action={disconnectFidelizeiAction} className="mt-4"><button className="text-xs text-red-700 underline">Desconectar (apaga a chave da loja)</button></form>}
    </section>

    {settings.connected && <section className="card mt-6 p-6">
      <h2 className="text-lg font-bold">Benefícios usados nos pedidos</h2>
      <p className="mt-1 text-sm text-slate-500">Depois que o pedido pago chega ao Bling, a loja confirma o uso no Fidelizei. Pedido cancelado devolve os pontos.</p>
      {redemptions.length === 0 ? <p className="mt-4 text-sm text-slate-500">Nenhum benefício usado ainda.</p> : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b text-xs uppercase text-slate-500"><tr><th className="py-2 pr-3">Pedido</th><th className="py-2 pr-3">Cliente</th><th className="py-2 pr-3">Benefício</th><th className="py-2 pr-3 text-right">Desconto</th><th className="py-2">Situação</th></tr></thead>
            <tbody className="divide-y">{redemptions.map(row => <tr key={row.id}>
              <td className="py-2 pr-3 font-medium">{row.orderNumber}<span className="block text-xs text-slate-400">{formatDateTime(row.createdAt)}</span></td>
              <td className="py-2 pr-3">{row.customer}</td>
              <td className="py-2 pr-3">{row.reward}<span className="block font-mono text-xs text-slate-400">{row.code} · {row.points} pts</span></td>
              <td className="py-2 pr-3 text-right">{row.discount ? formatPrice(row.discount) : '—'}</td>
              <td className="py-2"><span className={'rounded-full px-2 py-1 text-xs font-semibold ' + STATUS[row.status][1]}>{STATUS[row.status][0]}</span>{row.lastError && <span className="mt-1 block max-w-xs text-xs text-slate-500">{row.lastError}</span>}</td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
    </section>}
  </>;
}
