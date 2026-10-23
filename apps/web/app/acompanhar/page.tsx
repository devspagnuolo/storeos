import type { Metadata } from 'next';
import { Header } from '../../components/header';
import { TrackingForm } from './tracking-form';

export const metadata: Metadata = { title: 'Acompanhar pedido', robots: { index: false } };

// O link do e-mail do pedido traz ?pedido=00001: o número já vem preenchido e o cliente só confirma o e-mail.
export default async function TrackingPage({ searchParams }: { searchParams: Promise<{ pedido?: string }> }) {
  const pedido = (await searchParams).pedido?.replace(/[^\w-]/g, '').slice(0, 30) || undefined;
  return (
    <>
      <Header />
      <main className="shell py-12">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-3xl font-bold">Acompanhar pedido</h1>
          <p className="mt-2 text-slate-600">Informe o número do pedido e o e-mail usado na compra para ver a situação e o código de rastreio.</p>
          <TrackingForm initialNumber={pedido} />
        </div>
      </main>
    </>
  );
}
