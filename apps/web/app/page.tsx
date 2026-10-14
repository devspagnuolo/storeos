import Link from 'next/link';
import { Header } from '../components/header';
import { ProductCard } from '../components/product-card';
import { BannerCarousel } from '../components/banner-carousel';
import { getBanners, getProducts, getStore } from '../lib/api';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [{ items: products }, store, banners] = await Promise.all([getProducts({ pageSize: 8 }), getStore(), getBanners()]);
  const theme = store.themeConfig ?? {};
  const accent = theme.accentColor ?? '#5B3DF5';
  const title = theme.heroTitle ?? 'Sua marca merece uma experiência memorável.';
  const description = theme.heroDescription ?? 'Produtos extraordinários, entrega confiável e uma jornada simples do primeiro clique ao pós-venda.';
  const cta = theme.heroCta ?? 'Explorar coleção';

  return (
    <>
      <Header />
      {theme.announcementText && <div className="px-4 py-2 text-center text-sm font-medium text-white" style={{ backgroundColor: accent }}>{theme.announcementText}</div>}
      <main>
        {banners.length > 0 && <BannerCarousel slides={banners} />}
        {banners.length === 0 && <section className="bg-ink text-white">
          <div className="shell grid min-h-[440px] items-center gap-10 py-16 md:grid-cols-2 md:py-20">
            <div>
              <p className="mb-4 text-sm font-semibold uppercase tracking-[.2em]" style={{ color: accent }}>Sua loja</p>
              <h1 className="text-4xl font-black leading-tight sm:text-6xl">{title}</h1>
              <p className="mt-6 max-w-lg text-slate-300">{description}</p>
              <Link className="button mt-8" href="/categorias" style={{ backgroundColor: accent }}>{cta}</Link>
            </div>
            <div className="aspect-[4/3] overflow-hidden rounded-3xl p-2" style={{ backgroundColor: accent }}>
              {theme.heroImageUrl
                ? <img src={theme.heroImageUrl} alt="" className="h-full w-full rounded-2xl object-cover" />
                : <div className="h-full rounded-2xl border border-white/30 bg-white/10 backdrop-blur" />}
            </div>
          </div>
        </section>}
        <section className="shell py-16">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color: accent }}>CURADORIA</p>
              <h2 className="text-3xl font-bold">Mais desejados</h2>
            </div>
            <Link href="/categorias" className="font-medium" style={{ color: accent }}>Ver todos →</Link>
          </div>
          {products.length ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {products.map(product => <ProductCard product={product} key={product.id} />)}
            </div>
          ) : (
            <div className="card p-10 text-center text-slate-500">O catálogo será exibido assim que os produtos forem publicados.</div>
          )}
        </section>
        <section className="border-y bg-white">
          <div className="shell grid gap-6 py-10 text-center md:grid-cols-3">
            <div><b>Entrega para todo o Brasil</b><p className="text-sm text-slate-500">Prazo e valor calculados pelo seu CEP.</p></div>
            <div><b>Pagamento protegido</b><p className="text-sm text-slate-500">Pague com PIX, com confirmação rápida.</p></div>
            <div><b>Compra sem cadastro</b><p className="text-sm text-slate-500">Finalize o pedido só com seus dados de entrega.</p></div>
          </div>
        </section>
      </main>
    </>
  );
}
