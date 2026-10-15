'use client';
import Link from 'next/link';
import { useState } from 'react';
import { apiUrl } from '../../../lib/config';

/** O link do e-mail só abre esta tela; a pessoa confirma com o botão (programas de e-mail abrem links sozinhos). */
export function Unsubscribe({ token, storeName, email }: { token: string; storeName: string; email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  async function confirm() {
    setState('sending');
    try {
      const response = await fetch(`${apiUrl}/marketing/unsubscribe/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      setState(response.ok ? 'done' : 'error');
    } catch {
      setState('error');
    }
  }
  if (state === 'done') return <><p role="status" className="mt-3 text-slate-600">Pronto! {email} não receberá mais e-mails de novidades de {storeName}.</p><Link href="/" className="button mt-6 inline-block">Voltar para a loja</Link></>;
  return (
    <>
      <p className="mt-3 text-slate-600">Deseja parar de receber novidades e promoções de {storeName} em <strong>{email}</strong>?</p>
      <button onClick={confirm} disabled={state === 'sending'} className="button mt-6 disabled:opacity-60">{state === 'sending' ? 'Saindo…' : 'Sim, quero sair da lista'}</button>
      {state === 'error' && <p role="alert" className="mt-3 text-sm text-red-700">Não foi possível agora. Tente de novo em instantes.</p>}
    </>
  );
}
