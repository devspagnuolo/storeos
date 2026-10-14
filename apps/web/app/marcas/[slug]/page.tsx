import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Header } from '../../../components/header';
import { ProductGrid } from '../../../components/product-grid';
import { getBrands, getProducts } from '../../../lib/api';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = (await getBrands()).find(item => item.slug === slug);
  return { title: entry?.name ?? 'Marca', description: undefined };
}

export default async function BrandPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const page = Math.max(Number((await searchParams).page) || 1, 1);
  const [entries, products] = await Promise.all([getBrands(), getProducts({ brand: slug, page })]);
  const entry = entries.find(item => item.slug === slug);
  if (!entry) notFound();
  return (
    <>
      <Header />
      <main className="shell py-12">
        <p className="text-sm font-semibold text-brand">MARCA</p>
        <h1 className="text-3xl font-bold">{entry.name}</h1>
        {}
        <div className="mt-8"><ProductGrid page={products} basePath={`/marcas/${slug}`} empty="Nenhum produto por aqui ainda." /></div>
      </main>
    </>
  );
}
