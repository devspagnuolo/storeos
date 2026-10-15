import type { Metadata } from 'next';
import Link from 'next/link';
import { apiUrl } from '../../../lib/config';
import { ResendForm } from '../resend-form';

export const metadata: Metadata = { title: 'Confirmar e-mail', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  let result: { ok: true; storeSlug: string; storeName: string } | { ok: false; message: string } = { ok: false, message: 'Link inválido.' };
  if (token) {
    const response = await fetch(`${apiUrl}/onboarding/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }), cache: 'no-store' }).catch(() => undefined);
    const body = await response?.json().catch(() => ({}));
    result = response?.ok ? { ok: true, storeSlug: body.storeSlug, storeName: body.storeName } : { ok: false, message: typeof body?.message === 'string' ? body.message : 'Não foi possível confirmar agora.' };
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="card w-full max-w-md p-8">
        {result.ok ? (
          <>
            <h1 className="text-2xl font-bold">E-mail confirmado!</h1>
            <p className="mt-3 text-slate-600">A loja <b>{result.storeName}</b> está pronta. Entre com o endereço <b>{result.storeSlug}</b>, o seu e-mail e a senha que você escolheu.</p>
            <Link href="/admin/login" className="button mt-6 inline-block">Entrar no painel</Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold">Não deu para confirmar</h1>
            <p className="mt-3 text-slate-600">{result.message}</p>
            <ResendForm />
          </>
        )}
      </div>
    </main>
  );
}
