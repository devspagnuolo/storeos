'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { loginAction, type LoginState } from '../../app/conta/actions';

/**
 * Entrar ou criar conta sem senha: o cliente recebe um código de 6 números no e-mail.
 * Criar conta pede também o nome; a conta só nasce quando o código é confirmado.
 */
export function LoginForm({ returnTo, signup = false }: { returnTo?: 'checkout'; signup?: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, { step: 'email' });
  const back = returnTo && <input type="hidden" name="voltar" value={returnTo} />;
  const keepName = signup && state.name ? <input type="hidden" name="name" value={state.name} /> : null;
  return <div className="card mx-auto w-full max-w-md p-6 sm:p-8">
    <h1 className="text-2xl font-bold">{signup ? 'Criar uma conta' : 'Entrar na minha conta'}</h1>
    {returnTo === 'checkout' && <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Depois de entrar, você volta para finalizar a compra com seus dados já preenchidos.</p>}
    {state.step === 'email' ? <>
      <p className="mt-2 text-sm text-slate-600">{signup ? 'Informe seu nome e e-mail. Enviamos um código para confirmar, sem precisar de senha.' : 'Use o e-mail das suas compras. Enviamos um código para você entrar, sem precisar de senha.'}</p>
      <form action={action} className="mt-6 grid gap-4">
        <input type="hidden" name="intent" value="request" />{back}
        {signup && <label className="text-sm font-medium">Nome<input name="name" required minLength={2} maxLength={120} autoComplete="name" defaultValue={state.name} className="input mt-1" /></label>}
        <label className="text-sm font-medium">E-mail<input name="email" type="email" required autoComplete="email" defaultValue={state.email} className="input mt-1" /></label>
        <button disabled={pending} className="button w-full">{pending ? 'Enviando…' : 'Receber código'}</button>
      </form>
    </> : <>
      <p className="mt-2 text-sm text-slate-600">{signup ? <>Enviamos um código de 6 números para <strong className="text-slate-900">{state.email}</strong>. Ele vale por 15 minutos.</> : <>Se <strong className="text-slate-900">{state.email}</strong> tiver conta na loja, enviamos um código de 6 números. Ele vale por 15 minutos.</>}</p>
      <form action={action} className="mt-6 grid gap-4">
        <input type="hidden" name="email" value={state.email} />{back}{keepName}
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
