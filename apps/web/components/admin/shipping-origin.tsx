'use client';
import { useActionState } from 'react';
import { saveShippingOriginAction } from '../../app/admin/actions';
import type { CarrierStatus } from '../../lib/admin/types';

const SOURCE = { store: 'cadastrado aqui', server: 'vindo do servidor (variável SHIPPING_ORIGIN_ZIP)' } as const;
const formatZip = (zip: string) => `${zip.slice(0, 5)}-${zip.slice(5)}`;

/** CEP de onde a loja despacha e dias somados ao prazo da transportadora. Mudar de endereço é só trocar aqui. */
export function ShippingOrigin({ carrier }: { carrier: CarrierStatus }) {
  const [state, action, pending] = useActionState(saveShippingOriginAction, {});
  const fromStore = carrier.originSource === 'store';
  return (
    <form action={action} className="card mt-6 max-w-2xl p-6 text-sm">
      <h2 className="text-lg font-bold">CEP de origem e prazo</h2>
      <p className="mt-1 text-slate-600">É de onde a loja envia os pedidos; o frete dos Correios é calculado a partir dele. Se o endereço mudar, troque aqui.</p>
      <label className="mt-4 block font-medium">CEP
        <input name="zipCode" defaultValue={fromStore && carrier.originZip ? formatZip(carrier.originZip) : ''} placeholder={!fromStore && carrier.originZip ? formatZip(carrier.originZip) : '00000-000'} inputMode="numeric" autoComplete="postal-code" maxLength={9} className="input sm:max-w-[10rem]" />
      </label>
      <p className="mt-2 text-xs text-slate-500">
        {carrier.originZip ? `Em uso: ${formatZip(carrier.originZip)} (${SOURCE[carrier.originSource!]}).` : 'Nenhum CEP de origem definido: a cotação em tempo real fica desligada.'}
        {' '}Deixe vazio para voltar a usar o do servidor.
      </p>
      <label className="mt-5 block font-medium">Dias a mais no prazo da transportadora
        <input name="extraDays" type="number" min={0} max={30} step={1} defaultValue={carrier.extraDays ?? 0} inputMode="numeric" className="input sm:max-w-[6rem]" />
      </label>
      <p className="mt-2 text-xs text-slate-500">Somados ao prazo que o SuperFrete devolve, para o tempo de separação e postagem. Ex.: SuperFrete diz 2 dias e aqui está 2: a cliente vê 4 dias. Não muda as regras de frete abaixo, que já têm prazo próprio.</p>
      {!carrier.credentials && <p className="mt-2 text-xs text-amber-800">Falta também o token da transportadora (SUPERFRETE_TOKEN ou MELHOR_ENVIO_TOKEN) no servidor.</p>}
      <button className="button mt-4 disabled:opacity-60" disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</button>
      {state.error && <p role="alert" className="mt-3 text-red-700">{state.error}</p>}
      {state.ok && <p role="status" className="mt-3 text-emerald-700">{state.ok}</p>}
    </form>
  );
}
