'use client';
import { useActionState } from 'react';
import { changePasswordAction, saveStoreAction, type FormState } from '../../app/admin/actions';

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="text-sm text-red-700">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-emerald-700">{state.ok}</p>;
  return null;
}

export function StoreForm({ store }: { store: { slug: string; name: string } }) {
  const [state, action, pending] = useActionState(saveStoreAction, {});
  return (
    <form action={action} className="grid gap-4">
      <label className="text-sm font-medium">Nome da loja<input name="name" required minLength={2} maxLength={80} defaultValue={store.name} className="input" /></label>
      <p className="text-sm text-slate-500">Endereço da loja (usado no login do painel): <code className="font-mono">{store.slug}</code></p>
      <div className="flex flex-wrap items-center gap-4"><button className="button disabled:opacity-60" disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</button><Feedback state={state} /></div>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, {});
  return (
    <form action={action} className="grid gap-4">
      <label className="text-sm font-medium">Senha atual<input name="currentPassword" type="password" required autoComplete="current-password" className="input" /></label>
      <label className="text-sm font-medium">Nova senha<input name="newPassword" type="password" required minLength={12} maxLength={200} autoComplete="new-password" className="input" /><span className="text-xs font-normal text-slate-500">Pelo menos 12 caracteres.</span></label>
      <label className="text-sm font-medium">Confirme a nova senha<input name="confirmPassword" type="password" required minLength={12} maxLength={200} autoComplete="new-password" className="input" /></label>
      <div className="flex flex-wrap items-center gap-4"><button className="button disabled:opacity-60" disabled={pending}>{pending ? 'Alterando…' : 'Alterar senha'}</button><Feedback state={state} /></div>
    </form>
  );
}
