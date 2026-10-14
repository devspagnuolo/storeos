import Link from 'next/link';
import { Header } from '../components/header';
export default function NotFound() { return <><Header /><main className="shell py-20 text-center"><h1 className="text-3xl font-bold">Página não encontrada</h1><p className="mt-3 text-slate-500">O endereço pode ter mudado ou o produto não está mais disponível.</p><Link href="/categorias" className="button mt-8">Ver produtos</Link></main></>; }
