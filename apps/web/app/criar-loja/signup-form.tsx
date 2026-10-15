'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { signupAction } from './actions';

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, {});
  if (state.done) {
    return (
      <div className="card w-full max-w-md p-8">
        <h1 className="text-2xl font-bold">Confira o seu e-mail</h1>
        <p className="mt-3 text-slate-600">Enviamos um link para <b>{state.done.email}</b>. Clique nele para liberar o painel da sua loja. O link vale por 48 horas.</p>
        <p className="mt-3 text-sm text-slate-500">O endereço da sua loja no painel é <b>{state.done.storeSlug}</b>; você vai usá-lo para entrar.</p>
        <Link href="/admin/login" className="button mt-6 inline-block">Ir para a tela de entrada</Link>
      </div>
    );
  }
  const v = state.values;
  return (
    <form action={action} className="card w-full max-w-md p-8">
      <p className="text-xl font-black tracking-tight">STORE<span className="text-brand">OS</span></p>
      <h1 className="mt-4 text-2xl font-bold">Crie a sua loja</h1>
      <p className="mt-1 text-sm text-slate-500">Leva poucos minutos. Você ajusta o resto depois, no painel.</p>
      <label className="mt-6 block text-sm font-medium">Nome da loja<input name="storeName" required minLength={3} maxLength={60} defaultValue={v?.storeName} className="input" placeholder="Ex.: Vivi Moda Plus Size" /></label>
      <label className="mt-4 block text-sm font-medium">Seu nome<input name="ownerName" required minLength={2} maxLength={80} autoComplete="name" defaultValue={v?.ownerName} className="input" /></label>
      <label className="mt-4 block text-sm font-medium">E-mail<input name="email" type="email" required autoComplete="email" defaultValue={v?.email} className="input" /></label>
      <label className="mt-4 block text-sm font-medium">Senha <span className="font-normal text-slate-400">(mínimo 12 caracteres)</span><input name="password" type="password" required minLength={12} autoComplete="new-password" className="input" /></label>
      <label className="mt-4 block text-sm font-medium">Repita a senha<input name="confirm" type="password" required minLength={12} autoComplete="new-password" className="input" /></label>
      <label className="mt-4 flex items-start gap-2 text-sm"><input name="acceptTerms" type="checkbox" required className="mt-1" /><span>Li e aceito os termos de uso e a política de privacidade.</span></label>
      {state.error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
      <button className="button mt-6 w-full disabled:opacity-60" disabled={pending}>{pending ? 'Criando…' : 'Criar minha loja'}</button>
      <p className="mt-4 text-center text-sm text-slate-500">Já tem loja? <Link href="/admin/login" className="font-semibold text-brand">Entrar</Link></p>
    </form>
  );
}
