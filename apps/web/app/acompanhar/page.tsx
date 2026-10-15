import type { Metadata } from 'next';
import { Header } from '../../components/header';
import { TrackingForm } from './tracking-form';

export const metadata: Metadata = { title: 'Acompanhar pedido', robots: { index: false } };

export default function TrackingPage() {
  return (
    <>
      <Header />
      <main className="shell py-12">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-3xl font-bold">Acompanhar pedido</h1>
          <p className="mt-2 text-slate-600">Informe o número do pedido e o e-mail usado na compra para ver a situação e o código de rastreio.</p>
          <TrackingForm />
        </div>
      </main>
    </>
  );
}
