import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AddToCart } from '../../../components/add-to-cart';
import { ProductGallery } from '../../../components/product-gallery';
import { Header } from '../../../components/header';
import { ReviewsSection, Stars } from '../../../components/reviews-section';
import { TrackView } from '../../../components/track-view';
import { resolveSiteUrl } from '../../../lib/store-host';
import { HomeSections } from '../../../components/storefront/home-sections';
import { getProduct, getReviews, getStore } from '../../../lib/api';
import { formatPrice } from '../../../lib/format';
import { activeEngineDocument, engineFlag, engineSection, engineText } from '../../../lib/theme-engine';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct((await params).slug);
  if (!product) return { title: 'Produto não encontrado' };
  const title = product.seoTitle || product.name;
  const description = product.seoDescription || product.description?.slice(0, 160) || undefined;
  return { title, description, alternates: { canonical: `/produto/${product.slug}` }, openGraph: { title, description, type: 'website', images: product.images?.map(i => i.url) } };
}

export default async function ProductPage({ params }: Props) {
  const slug = (await params).slug;
  const [product, reviews, store, engine] = await Promise.all([getProduct(slug), getReviews(slug), getStore(), activeEngineDocument()]);
  // Tema avançado: só opções de apresentação. Preço, estoque, opções e compra nunca mudam por tema.
  const detail = engineSection(engine, 'product', 'storeos.product-detail.v1');
  if (!product) notFound();
  const image = product.images?.find(i => !i.color) ?? product.images?.[0];
  // Primeira foto de cada cor, para o carrinho mostrar a cor escolhida.
  const colorImages = Object.fromEntries((product.images ?? []).filter(i => i.color).reverse().map(i => [i.color!.toLowerCase(), i.url]));
  const siteUrl = await resolveSiteUrl();
  // Dados estruturados para o Google exibir preço e disponibilidade no resultado de busca.
  const jsonLd = { '@context': 'https://schema.org', '@type': 'Product', name: product.name, sku: product.sku, brand: product.brand ? { '@type': 'Brand', name: product.brand.name } : undefined, description: product.description, image: product.images?.map(i => i.url), offers: { '@type': 'Offer', url: `${siteUrl}/produto/${product.slug}`, priceCurrency: 'BRL', price: product.price, availability: `https://schema.org/${product.available > 0 ? 'InStock' : 'OutOfStock'}` },
    ...(reviews.summary.count > 0 && { aggregateRating: { '@type': 'AggregateRating', ratingValue: reviews.summary.average, reviewCount: reviews.summary.count, bestRating: 5, worstRating: 1 }, review: reviews.items.slice(0, 5).map(r => ({ '@type': 'Review', author: { '@type': 'Person', name: r.author }, datePublished: r.createdAt.slice(0, 10), reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 }, reviewBody: r.body, ...(r.title && { name: r.title }) })) }) };
  const breadcrumb = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Produtos', item: `${siteUrl}/categorias` },
    ...(product.categories[0] ? [{ '@type': 'ListItem', position: 2, name: product.categories[0].name, item: `${siteUrl}/categorias/${product.categories[0].slug}` }] : []),
    { '@type': 'ListItem', position: product.categories[0] ? 3 : 2, name: product.name, item: `${siteUrl}/produto/${product.slug}` },
  ] };
  return (
    <>
      <Header />
      <TrackView id={product.id} name={product.name} price={Number(product.price)} />
      <main className="shell py-10">
        <nav className="mb-6 text-sm text-slate-500"><Link href="/categorias">Produtos</Link>{product.categories[0] && <> / <Link href={`/categorias/${product.categories[0].slug}`}>{product.categories[0].name}</Link></>}</nav>
        <div className="grid gap-10 md:grid-cols-2">
          <ProductGallery images={product.images ?? []} name={product.name} />
          <div>
            {product.brand && <Link href={`/marcas/${product.brand.slug}`} className="text-sm font-semibold text-brand">{product.brand.name}</Link>}
            <h1 className="text-3xl font-bold">{product.name}</h1>
            {reviews.summary.count > 0 && <a href="#avaliacoes" className="mt-1 flex items-center gap-2 text-sm"><Stars value={reviews.summary.average} /><span className="text-slate-500">{reviews.summary.average.toFixed(1).replace('.', ',')} ({reviews.summary.count})</span></a>}
            <p className="mt-4 text-3xl font-black">{formatPrice(product.price)}</p>
            <p className="mt-1 text-sm text-slate-500">ou no PIX, com confirmação rápida</p>
            {product.description && engineFlag(detail?.showDescription, true) && <p className="mt-6 leading-relaxed text-slate-700">{product.description}</p>}
            <AddToCart product={{ id: product.id, slug: product.slug, name: product.name, price: product.price, image: image?.url }} available={product.available} variants={product.variants ?? []} buttonLabel={engineText(detail?.buttonLabel) || undefined} colorImages={colorImages} />
            {engineFlag(detail?.showSku, true) && <p className="mt-8 text-xs text-slate-400">SKU {product.sku}</p>}
          </div>
        </div>
        <ReviewsSection productSlug={product.slug} reviews={reviews} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([jsonLd, breadcrumb]).replace(/</g, '\\u003c') }} />
      </main>
      {!engine && <HomeSections sections={store.themeConfig?.pages?.product?.sections ?? []} />}
    </>
  );
}
