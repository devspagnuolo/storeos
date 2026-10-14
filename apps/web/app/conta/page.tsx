import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/header';

export const metadata: Metadata = { title: 'Minha conta' };

export default function AccountPage() {
  return <><Header /><main className="shell py-14"><h1 className="text-3xl font-bold">Minha conta</h1><div className="card mt-8 max-w-xl p-8"><p className="text-slate-600">Você pode comprar sem criar conta: informe seu e-mail e seus dados no checkout. Guarde o número do pedido para acompanhar o andamento.</p><p className="mt-3 text-slate-600">A área do cliente, com histórico de pedidos e endereços salvos, chega em breve.</p><Link href="/categorias" className="button mt-6">Continuar comprando</Link></div></main></>;
}
