import type { Metadata } from 'next';
import { Header } from '../../../components/header';
import { RecoverCart } from './recover-cart';

export const metadata: Metadata = { title: 'Seu carrinho', robots: { index: false } };

export default async function RecoverPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ sair?: string }> }) {
  const { token } = await params;
  const { sair } = await searchParams;
  return (
    <>
      <Header />
      <main className="shell py-16">
        <div className="mx-auto max-w-md text-center"><RecoverCart token={token} optOut={sair === '1'} /></div>
      </main>
    </>
  );
}
