import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ThemeDocument } from '@storeos/contracts';
import { ThemeEngineHome } from '../../../../components/storefront/theme-engine-home';
import { getCategories, getProducts, getStore } from '../../../../lib/api';
import { adminFetch } from '../../../../lib/admin/session';
import { engineStyle, setEngineDraft } from '../../../../lib/theme-engine';
import CategoryPage from '../../../categorias/[slug]/page';
import ProductPage from '../../../produto/[slug]/page';
import SearchPage from '../../../busca/page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Prévia do tema', robots: { index: false, follow: false } };

type DraftResponse = {
  installation: { release: { manifest: { displayName: string; slug: string; version: string } } };
  draft: { revision: number; document: ThemeDocument };
};
const PAGES = { inicio: 'Página inicial', categoria: 'Categoria', produto: 'Produto', busca: 'Busca' } as const;
type PageKey = keyof typeof PAGES;

/**
 * Prévia privada do rascunho de um tema avançado, desenhada pelas MESMAS páginas da vitrine e com produtos e
 * categorias reais. Só abre com a sessão do painel (cookie httpOnly) e a API confere que a instalação é da
 * loja logada; sem sessão ou de outra loja, 404. O rascunho vale só para esta requisição.
 */
export default async function ThemeDraftPreview({ params, searchParams }: { params: Promise<{ installationId: string }>; searchParams: Promise<{ pagina?: string }> }) {
  const { installationId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,96}$/.test(installationId)) notFound();
  const requested = (await searchParams).pagina ?? 'inicio';
  const page: PageKey = requested in PAGES ? requested as PageKey : 'inicio';
  const [result, store, categories, products] = await Promise.all([
    adminFetch<DraftResponse>(`/themes/installations/${encodeURIComponent(installationId)}/draft`).catch(() => null),
    getStore(),
    getCategories(),
    getProducts({ pageSize: 1 }),
  ]);
  if (!result) notFound();
  const document = result.draft.document;
  setEngineDraft(document);
  const manifest = result.installation.release.manifest;
  const category = categories[0];
  const product = products.items[0];
  const base = '/previa/tema/' + encodeURIComponent(installationId);

  let body: React.ReactNode;
  if (page === 'categoria') body = category ? await CategoryPage({ params: Promise.resolve({ slug: category.slug }), searchParams: Promise.resolve({}) }) : <Empty text="Cadastre uma categoria para ver esta página." />;
  else if (page === 'produto') body = product ? await ProductPage({ params: Promise.resolve({ slug: product.slug }) }) : <Empty text="Publique um produto para ver esta página." />;
  else if (page === 'busca') body = await SearchPage({ searchParams: Promise.resolve(category ? { categoria: category.slug } : {}) });
  else body = <ThemeEngineHome theme={{ document, release: { manifest } }} store={store} />;

  return <div className="min-h-screen" style={engineStyle(document)}>
    <div role="note" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-amber-50 px-4 py-1.5 text-center text-xs font-semibold text-amber-800">
      <span>Prévia do rascunho do tema “{manifest.displayName}” (revisão {result.draft.revision}) com seus produtos reais. Só você vê esta página.</span>
      <nav aria-label="Páginas da prévia" className="flex gap-2">{(Object.keys(PAGES) as PageKey[]).map(key => <Link key={key} href={key === 'inicio' ? base : `${base}?pagina=${key}`} aria-current={key === page ? 'page' : undefined} className={'rounded px-2 py-0.5 ' + (key === page ? 'bg-amber-200' : 'underline')}>{PAGES[key]}</Link>)}</nav>
    </div>
    {body}
  </div>;
}

function Empty({ text }: { text: string }) {
  return <main className="shell py-16 text-center text-slate-500">{text}</main>;
}
