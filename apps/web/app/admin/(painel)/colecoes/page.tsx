import { BrandForm, CollectionForm } from '../../../../components/admin/collection-forms';
import { adminBrands } from '../../../../lib/admin/categories';
import { adminFetch } from '../../../../lib/admin/session';
import type { AdminCollection } from '../../../../lib/admin/types';

export const dynamic = 'force-dynamic';

export default async function CollectionsPage() {
  const [collections, brands] = await Promise.all([adminFetch<AdminCollection[]>('/catalog/admin/collections'), adminBrands()]);
  return (
    <>
      <h1 className="text-3xl font-bold">Coleções e marcas</h1>
      <p className="mt-1 text-sm text-slate-500">Agrupe produtos para campanhas e organize a vitrine por marca. Cada uma ganha uma página própria na loja.</p>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {collections.map(c => <details key={c.id} className="card p-5"><summary className="cursor-pointer font-bold">{c.name} <span className="ml-2 text-xs font-normal text-slate-500">/colecoes/{c.slug} · {c.skus.length} produto(s){c.active ? '' : ' · oculta'}</span></summary><div className="mt-4"><CollectionForm collection={c} /></div></details>)}
          <section className="card p-6"><h2 className="mb-4 text-lg font-bold">Nova coleção</h2><CollectionForm /></section>
        </div>
        <section className="card h-fit p-6">
          <h2 className="mb-4 text-lg font-bold">Marcas</h2>
          <ul className="mb-4 space-y-1 text-sm">{brands.length ? brands.map(b => <li key={b.id}>{b.name} <span className="text-xs text-slate-400">/marcas/{b.slug}</span></li>) : <li className="text-slate-500">Nenhuma marca ainda.</li>}</ul>
          <BrandForm />
        </section>
      </div>
    </>
  );
}
