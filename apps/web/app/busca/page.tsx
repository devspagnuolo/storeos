import type { Metadata } from 'next';
import { Header } from '../../components/header';
import { ProductGrid } from '../../components/product-grid';
import { getProducts } from '../../lib/api';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Buscar' };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  const q = params.q?.trim().slice(0, 100) ?? '';
  const page = Math.max(Number(params.page) || 1, 1);
  const results = q ? await getProducts({ q, page }) : null;
  return (
    <>
      <Header />
      <main className="shell py-12">
        <h1 className="text-3xl font-bold">Buscar produtos</h1>
        <form action="/busca" className="mt-6 flex max-w-xl gap-2" role="search">
          <input name="q" defaultValue={q} placeholder="O que você procura?" aria-label="Buscar produtos" className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5" />
          <button className="button">Buscar</button>
        </form>
        {results && <div className="mt-10"><p className="mb-6 text-sm text-slate-500">{results.total} resultado(s) para “{q}”</p><ProductGrid page={results} basePath="/busca" params={{ q }} empty="Nenhum produto encontrado. Tente outro termo." /></div>}
      </main>
    </>
  );
}
