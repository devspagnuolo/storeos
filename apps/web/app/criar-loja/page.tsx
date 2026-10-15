import type { Metadata } from 'next';
import Link from 'next/link';
import { apiUrl } from '../../lib/config';
import { SignupForm } from './signup-form';

export const metadata: Metadata = { title: 'Criar minha loja', robots: { index: false } };
export const dynamic = 'force-dynamic';

async function signupOpen() {
  try {
    const response = await fetch(`${apiUrl}/onboarding/status`, { cache: 'no-store' });
    return response.ok && (await response.json()).enabled === true;
  } catch {
    return false;
  }
}

export default async function CreateStorePage() {
  const open = await signupOpen();
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      {open ? <SignupForm /> : (
        <div className="card w-full max-w-md p-8">
          <h1 className="text-2xl font-bold">Cadastro de novas lojas fechado</h1>
          <p className="mt-3 text-slate-600">No momento não estamos aceitando novas lojas por aqui. Se você já tem uma, entre pelo painel.</p>
          <Link href="/admin/login" className="button mt-6 inline-block">Entrar no painel</Link>
        </div>
      )}
    </main>
  );
}
