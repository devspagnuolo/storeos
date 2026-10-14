'use client';
import { useActionState } from 'react';
import { loginAction } from '../actions';

export default function AdminLoginPage() {
  const [state, action, pending] = useActionState(loginAction, {});
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form action={action} className="card w-full max-w-sm p-8">
        <p className="text-xl font-black tracking-tight">STORE<span className="text-brand">OS</span></p>
        <h1 className="mt-4 text-2xl font-bold">Entrar no painel</h1>
        <label className="mt-6 block text-sm font-medium">Loja<input name="storeSlug" required defaultValue={state.storeSlug || process.env.NEXT_PUBLIC_STORE_SLUG || 'demo'} className="input" /></label>
        <label className="mt-4 block text-sm font-medium">E-mail<input name="email" type="email" required autoComplete="username" defaultValue={state.email} className="input" /></label>
        <label className="mt-4 block text-sm font-medium">Senha<input name="password" type="password" required minLength={8} autoComplete="current-password" className="input" /></label>
        <label className="mt-4 block text-sm font-medium">Código de verificação <span className="font-normal text-slate-400">(se ativado)</span><input name="code" inputMode="text" autoComplete="one-time-code" maxLength={32} className="input" placeholder="123456" /></label>
        {state.error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
        <button className="button mt-6 w-full disabled:opacity-60" disabled={pending}>{pending ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </main>
  );
}
