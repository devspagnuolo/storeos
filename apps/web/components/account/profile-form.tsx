'use client';
import { useActionState } from 'react';
import { updateProfileAction, type ProfileState } from '../../app/conta/actions';
import { formatPhone } from '../../lib/checkout-draft';
import type { AccountProfile } from '../../lib/account/types';

export function ProfileForm({ profile }: { profile: AccountProfile }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateProfileAction, {});
  return <form action={action} className="grid gap-4">
    <label className="text-sm font-medium">Nome completo<input name="name" required minLength={3} defaultValue={profile.name} autoComplete="name" className="input mt-1" /></label>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium">Celular<input name="phone" inputMode="tel" defaultValue={profile.phone ? formatPhone(profile.phone) : ''} placeholder="(11) 98888-7777" autoComplete="tel" className="input mt-1" /></label>
      <label className="text-sm font-medium text-slate-500">E-mail<input value={profile.email} readOnly className="input mt-1 bg-slate-50" /></label>
    </div>
    {profile.document && <p className="text-sm text-slate-500">CPF/CNPJ: {profile.document}</p>}
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="marketingOptIn" defaultChecked={profile.marketingOptIn} className="mt-1" />Quero receber novidades e promoções por e-mail.</label>
    <div className="flex flex-wrap items-center gap-3">
      <button disabled={pending} className="button">{pending ? 'Salvando…' : 'Salvar dados'}</button>
      {state.ok && <span role="status" className="text-sm text-emerald-700">Dados salvos.</span>}
      {state.error && <span role="alert" className="text-sm text-red-700">{state.error}</span>}
    </div>
  </form>;
}
