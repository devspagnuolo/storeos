import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../../components/header';
import { serverApiUrl } from '../../../lib/admin/session';
import { Unsubscribe } from './unsubscribe';

export const metadata: Metadata = { title: 'Sair da lista de e-mails', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const response = await fetch(`${serverApiUrl}/marketing/unsubscribe/${encodeURIComponent(token)}`, { cache: 'no-store' }).catch(() => null);
  const info = response?.ok ? ((await response.json()) as { storeName: string; email: string }) : null;
  return (
    <>
      <Header />
      <main className="shell py-16">
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-2xl font-bold">Sair da lista de e-mails</h1>
          {info ? <Unsubscribe token={token} storeName={info.storeName} email={info.email} /> : <><p className="mt-3 text-slate-600">Este link não é mais válido.</p><Link href="/" className="button mt-6 inline-block">Voltar para a loja</Link></>}
        </div>
      </main>
    </>
  );
}
