import Link from 'next/link';
import { Header } from '../components/header';
import { ProductCard } from '../components/product-card';
import { getProducts } from '../lib/api';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { items: products } = await getProducts({ pageSize: 8 });

  return (
    <>
      <Header />
      <main>
        <section className="bg-ink text-white">
          <div className="shell grid min-h-[440px] items-center gap-10 py-20 md:grid-cols-2">
            <div>
              <p className="mb-4 text-sm font-semibold uppercase tracking-[.2em] text-violet-300">Comércio sem limites</p>
              <h1 className="text-4xl font-black leading-tight sm:text-6xl">Sua marca merece uma experiência memorável.</h1>
              <p className="mt-6 max-w-lg text-slate-300">Produtos extraordinários, entrega confiável e uma jornada simples do primeiro clique ao pós-venda.</p>
              <Link className="button mt-8" href="/categorias">Explorar coleção</Link>
            </div>
            <div className="aspect-[4/3] rounded-3xl bg-gradient-to-br from-brand via-violet-500 to-cyan-400 p-8">
              <div className="h-full rounded-2xl border border-white/30 bg-white/10 backdrop-blur" />
            </div>
          </div>
        </section>
        <section className="shell py-16">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <p className="text-sm font-semibold text-brand">CURADORIA</p>
              <h2 className="text-3xl font-bold">Mais desejados</h2>
            </div>
            <Link href="/categorias" className="font-medium text-brand">Ver todos →</Link>
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
