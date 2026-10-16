import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ThemeDocument } from '@storeos/contracts';
import { ThemeEngineHome } from '../../../../components/storefront/theme-engine-home';
import { getCategories, getPages, getPosts, getProducts, getStore } from '../../../../lib/api';
import { BlogIndexView, BlogPostView } from '../../../../components/blog/blog-pages';
import { ContentPageView } from '../../../../components/blog/content-page-view';
import { adminFetch } from '../../../../lib/admin/session';
import { engineStyle, setEngineDraft } from '../../../../lib/theme-engine';
import CategoryPage from '../../../categorias/[slug]/page';
import ProductPage from '../../../produto/[slug]/page';
import SearchPage from '../../../busca/page';
import CartPage from '../../../carrinho/page';
import NotFound from '../../../not-found';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Prévia do tema', robots: { index: false, follow: false } };

type DraftResponse = {
  installation: { release: { manifest: { displayName: string; slug: string; version: string } } };
  draft: { revision: number; document: ThemeDocument };
};
const PAGES = { inicio: 'Página inicial', categoria: 'Categoria', produto: 'Produto', busca: 'Busca', carrinho: 'Carrinho', conteudo: 'Página de conteúdo', blog: 'Blog', artigo: 'Artigo', erro: 'Página não encontrada' } as const;
type PageKey = keyof typeof PAGES;

/**
 * Prévia privada do rascunho de um tema avançado, desenhada pelas MESMAS páginas da vitrine e com produtos e
 * categorias reais. Só abre com a sessão do painel (cookie httpOnly) e a API confere que a instalação é da
 * loja logada; sem sessão ou de outra loja, 404. O rascunho vale só para esta requisição.
 */
export default async function ThemeDraftPreview({ params, searchParams }: { params: Promise<{ installationId: string }>; searchParams: Promise<{ pagina?: string; fonte?: string }> }) {
  const { installationId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,96}$/.test(installationId)) notFound();
  const query = await searchParams;
  const requested = query.pagina ?? 'inicio';
  const fromPublished = query.fonte === 'publicado';
  const page: PageKey = requested in PAGES ? requested as PageKey : 'inicio';
  const [result, latest, store, categories, products, pages, posts] = await Promise.all([
    adminFetch<DraftResponse>(`/themes/installations/${encodeURIComponent(installationId)}/draft`).catch(() => null),
    fromPublished ? adminFetch<{ publication: { version: number; document: ThemeDocument } | null }>(`/themes/installations/${encodeURIComponent(installationId)}/published`).catch(() => null) : Promise.resolve(null),
    getStore(),
    getCategories(),
    getProducts({ pageSize: 1 }),
    page === 'conteudo' ? getPages() : Promise.resolve([]),
    page === 'artigo' ? getPosts({ limit: 1 }) : Promise.resolve({ items: [], total: 0 }),
  ]);
  if (!result) notFound();
  // Na comparação, a mesma prévia desenha a última versão publicada em vez do rascunho.
  if (fromPublished && !latest?.publication) return <Empty text="Este tema ainda não foi publicado." />;
  const document = fromPublished && latest?.publication ? latest.publication.document : result.draft.document;
  setEngineDraft(document);
  const manifest = result.installation.release.manifest;
  const category = categories[0];
  const product = products.items[0];
  const base = '/previa/tema/' + encodeURIComponent(installationId);

  let body: React.ReactNode;
  if (page === 'categoria') body = category ? await CategoryPage({ params: Promise.resolve({ slug: category.slug }), searchParams: Promise.resolve({}) }) : <Empty text="Cadastre uma categoria para ver esta página." />;
  else if (page === 'produto') body = product ? await ProductPage({ params: Promise.resolve({ slug: product.slug }) }) : <Empty text="Publique um produto para ver esta página." />;
  else if (page === 'busca') body = await SearchPage({ searchParams: Promise.resolve(category ? { categoria: category.slug } : {}) });
  else if (page === 'carrinho') body = await CartPage();
  else if (page === 'conteudo') body = pages[0] ? await ContentPageView({ slug: pages[0].slug }) : <Empty text="Publique uma página em Páginas para ver esta prévia." />;
  else if (page === 'blog') body = await BlogIndexView({});
  else if (page === 'artigo') body = posts.items[0] ? await BlogPostView({ slug: posts.items[0].slug }) : <Empty text="Publique um artigo no Blog para ver esta prévia." />;
  else if (page === 'erro') body = await NotFound();
  else body = <ThemeEngineHome theme={{ document, release: { manifest } }} store={store} />;

  return <div className="min-h-screen" style={engineStyle(document)}>
    <div role="note" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-amber-50 px-4 py-1.5 text-center text-xs font-semibold text-amber-800">
      <span>{fromPublished && latest?.publication ? `Versão ${latest.publication.version} publicada do tema “${manifest.displayName}”` : `Prévia do rascunho do tema “${manifest.displayName}” (revisão ${result.draft.revision})`} com seus produtos reais. Só você vê esta página.</span>
      <nav aria-label="Páginas da prévia" className="flex flex-wrap justify-center gap-2">{(Object.keys(PAGES) as PageKey[]).map(key => <Link key={key} href={(key === 'inicio' ? base : `${base}?pagina=${key}`) + (fromPublished ? (key === 'inicio' ? '?' : '&') + 'fonte=publicado' : '')} aria-current={key === page ? 'page' : undefined} className={'rounded px-2 py-0.5 ' + (key === page ? 'bg-amber-200' : 'underline')}>{PAGES[key]}</Link>)}</nav>
    </div>
    {body}
  </div>;
}

function Empty({ text }: { text: string }) {
  return <main className="shell py-16 text-center text-slate-500">{text}</main>;
}
