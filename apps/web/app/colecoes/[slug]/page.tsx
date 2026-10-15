import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Header } from '../../../components/header';
import { ProductGrid } from '../../../components/product-grid';
import { getCollections, getProducts } from '../../../lib/api';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = Math.max(Number((await searchParams).page) || 1, 1);
  const entry = (await getCollections()).find(item => item.slug === slug);
  return { alternates: { canonical: page > 1 ? `/colecoes/${slug}?page=${page}` : `/colecoes/${slug}` }, title: entry?.name ?? 'Coleção', description: entry?.description ?? undefined };
}

export default async function CollectionPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const page = Math.max(Number((await searchParams).page) || 1, 1);
  const [entries, products] = await Promise.all([getCollections(), getProducts({ collection: slug, page })]);
  const entry = entries.find(item => item.slug === slug);
  if (!entry) notFound();
  return (
    <>
      <Header />
      <main className="shell py-12">
        <p className="text-sm font-semibold text-brand">COLEÇÃO</p>
        <h1 className="text-3xl font-bold">{entry.name}</h1>
        {entry.description && <p className="mt-2 text-slate-500">{entry.description}</p>}
        <div className="mt-8"><ProductGrid page={products} basePath={`/colecoes/${slug}`} empty="Nenhum produto por aqui ainda." /></div>
      </main>
    </>
  );
}
