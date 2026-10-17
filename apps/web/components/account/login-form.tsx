'use client';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { loginAction, type LoginState } from '../../app/conta/actions';
import type { FidelizeiProgram } from '../../lib/account/types';
import { formatCpf } from '../../lib/payment';

/**
 * Entrar ou criar conta sem senha: o cliente recebe um código de 6 números no e-mail.
 * Criar conta pede também o nome; a conta só nasce quando o código é confirmado.
 */
export function LoginForm({ returnTo, signup = false, program }: { returnTo?: 'checkout'; signup?: boolean; program?: FidelizeiProgram }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, { step: 'email' });
  const [joinLoyalty, setJoinLoyalty] = useState(Boolean(state.fidelizei));
  const back = returnTo && <input type="hidden" name="voltar" value={returnTo} />;
  const keepName = signup && state.name ? <input type="hidden" name="name" value={state.name} /> : null;
  // O aceite e o CPF seguem até o código ser confirmado; a adesão é feita assim que a conta nasce.
  const keepLoyalty = signup && state.fidelizei ? <><input type="hidden" name="fidelizei" value="on" /><input type="hidden" name="fidelizeiCpf" value={state.fidelizei.cpf} />{state.fidelizei.phone && <input type="hidden" name="fidelizeiPhone" value={state.fidelizei.phone} />}</> : null;
  const link = (href: string | null | undefined, text: string) => href ? <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline">{text}</a> : text;
  return <div className="card mx-auto w-full max-w-md p-6 sm:p-8">
    <h1 className="text-2xl font-bold">{signup ? 'Criar uma conta' : 'Entrar na minha conta'}</h1>
    {returnTo === 'checkout' && <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Depois de entrar, você volta para finalizar a compra com seus dados já preenchidos.</p>}
    {state.step === 'email' ? <>
      <p className="mt-2 text-sm text-slate-600">{signup ? 'Informe seu nome e e-mail. Enviamos um código para confirmar, sem precisar de senha.' : 'Use o e-mail das suas compras. Enviamos um código para você entrar, sem precisar de senha.'}</p>
      <form action={action} className="mt-6 grid gap-4">
        <input type="hidden" name="intent" value="request" />{back}
        {signup && <label className="text-sm font-medium">Nome<input name="name" required minLength={2} maxLength={120} autoComplete="name" defaultValue={state.name} className="input mt-1" /></label>}
        <label className="text-sm font-medium">E-mail<input name="email" type="email" required autoComplete="email" defaultValue={state.email} className="input mt-1" /></label>
        {signup && program?.enabled && <fieldset className="rounded-xl border border-slate-200 p-4">
          {/* O aceite vai num campo oculto: o React limpa o formulário depois de cada envio. */}
          {joinLoyalty && <input type="hidden" name="fidelizei" value="on" />}
          <legend className="flex items-center gap-2 px-1 text-sm font-semibold"><img src="/fidelizei.svg" alt="" width={34} height={24} className="h-6 w-[34px] object-contain" />Programa de pontos Fidelizei</legend>
          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input type="checkbox" checked={joinLoyalty} onChange={event => setJoinLoyalty(event.target.checked)} className="mt-1" />
            <span>Quero participar do programa de pontos e aceito os {link(program.termsUrl, 'termos do programa')} e a {link(program.privacyUrl, 'política de privacidade')}.</span>
          </label>
          {joinLoyalty && <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">CPF<input name="fidelizeiCpf" required inputMode="numeric" autoComplete="off" maxLength={14} defaultValue={state.fidelizei ? formatCpf(state.fidelizei.cpf) : ''} onChange={event => { event.target.value = formatCpf(event.target.value); }} placeholder="000.000.000-00" className="input mt-1" /></label>
            <label className="text-sm font-medium">Celular (opcional)<input name="fidelizeiPhone" inputMode="tel" autoComplete="tel" maxLength={20} defaultValue={state.fidelizei?.phone ?? ''} placeholder="(11) 99999-8888" className="input mt-1" /></label>
            <p className="text-xs text-slate-500 sm:col-span-2">O CPF identifica você no programa: as compras com ele somam pontos.</p>
          </div>}
        </fieldset>}
        <button disabled={pending} className="button w-full">{pending ? 'Enviando…' : 'Receber código'}</button>
      </form>
    </> : <>
      <p className="mt-2 text-sm text-slate-600">{signup ? <>Enviamos um código de 6 números para <strong className="text-slate-900">{state.email}</strong>. Ele vale por 15 minutos.</> : <>Se <strong className="text-slate-900">{state.email}</strong> tiver conta na loja, enviamos um código de 6 números. Ele vale por 15 minutos.</>}</p>
      <form action={action} className="mt-6 grid gap-4">
        <input type="hidden" name="email" value={state.email} />{back}{keepName}{keepLoyalty}
        <label className="text-sm font-medium">Código<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{3}\s?\d{3}" maxLength={7} required autoFocus className="input mt-1 text-center font-mono text-2xl tracking-[0.4em]" /></label>
        <button name="intent" value="verify" disabled={pending} className="button w-full">{pending ? 'Conferindo…' : signup ? 'Criar conta' : 'Entrar'}</button>
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <button name="intent" value="resend" formNoValidate disabled={pending} className="font-semibold text-brand">Reenviar código</button>
          <button name="intent" value="change" formNoValidate disabled={pending} className="text-slate-500 hover:text-slate-800">Usar outro e-mail</button>
        </div>
      </form>
    </>}
    {state.info && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{state.info}</p>}
    {state.error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
    <p className="mt-6 border-t pt-4 text-sm text-slate-600">{signup
      ? <>Já tem conta? <Link href={returnTo ? '/conta?voltar=checkout' : '/conta'} className="font-semibold text-brand">Iniciar sessão</Link></>
      : <>Ainda não tem conta? <Link href={returnTo ? '/conta?criar=1&voltar=checkout' : '/conta?criar=1'} className="font-semibold text-brand">Criar uma conta</Link></>}</p>
  </div>;
}
