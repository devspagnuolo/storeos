import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AddToCart } from '../../../components/add-to-cart';
import { Header } from '../../../components/header';
import { getProduct } from '../../../lib/api';
import { formatPrice } from '../../../lib/format';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct((await params).slug);
  if (!product) return { title: 'Produto não encontrado' };
  const title = product.seoTitle || product.name;
  const description = product.seoDescription || product.description?.slice(0, 160) || undefined;
  return { title, description, openGraph: { title, description, images: product.images?.map(i => i.url) } };
}

export default async function ProductPage({ params }: Props) {
  const product = await getProduct((await params).slug);
  if (!product) notFound();
  const image = product.images?.[0];
  // Dados estruturados para o Google exibir preço e disponibilidade no resultado de busca.
  const jsonLd = { '@context': 'https://schema.org', '@type': 'Product', name: product.name, sku: product.sku, brand: product.brand ? { '@type': 'Brand', name: product.brand.name } : undefined, description: product.description, image: product.images?.map(i => i.url), offers: { '@type': 'Offer', priceCurrency: 'BRL', price: product.price, availability: `https://schema.org/${product.available > 0 ? 'InStock' : 'OutOfStock'}` } };
  return (
    <>
      <Header />
      <main className="shell py-10">
        <nav className="mb-6 text-sm text-slate-500"><Link href="/categorias">Produtos</Link>{product.categories[0] && <> / <Link href={`/categorias/${product.categories[0].slug}`}>{product.categories[0].name}</Link></>}</nav>
        <div className="grid gap-10 md:grid-cols-2">
          <div className="card aspect-square overflow-hidden bg-gradient-to-br from-slate-100 to-violet-100">{image && <img src={image.url} alt={image.alt || product.name} className="h-full w-full object-cover" />}</div>
          <div>
            {product.brand && <Link href={`/marcas/${product.brand.slug}`} className="text-sm font-semibold text-brand">{product.brand.name}</Link>}
            <h1 className="text-3xl font-bold">{product.name}</h1>
            <p className="mt-4 text-3xl font-black">{formatPrice(product.price)}</p>
            <p className="mt-1 text-sm text-slate-500">ou no PIX, com confirmação rápida</p>
            {product.description && <p className="mt-6 leading-relaxed text-slate-700">{product.description}</p>}
            <AddToCart product={{ id: product.id, slug: product.slug, name: product.name, price: product.price, image: image?.url }} available={product.available} variants={product.variants ?? []} />
            <p className="mt-8 text-xs text-slate-400">SKU {product.sku}</p>
          </div>
        </div>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      </main>
    </>
  );
}
