import Link from 'next/link';
import type { ThemeDocument, ThemeSectionInstance } from '@storeos/contracts';
import { Header } from '../header';
import { NewsletterForm } from '../newsletter-form';
import { ProductGrid } from '../product-grid';
import { getCategories, getProducts, type StoreInfo } from '../../lib/api';
import { gridColumns, visibilityClass } from '../../lib/responsive-grid';

type PublishedTheme = {
  document: ThemeDocument;
  release: { manifest: { displayName: string; slug: string; version: string } };
};

const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const columns = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
const safeColor = (value: unknown, fallback: string) =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

/** Runtime declarativo: apenas componentes compilados pelo STOREOS; nunca avalia markup/código do tema. */
export async function ThemeEngineHome({ theme, store }: { theme: PublishedTheme; store: StoreInfo }) {
  const template = theme.document.templates.home;
  if (!template) return null;
  const sections = template.sections.filter(section => section.enabled);
  const needsProducts = sections.some(section => section.type === 'storeos.product-collection.v1');
  const needsCategories = sections.some(section => section.type === 'storeos.category-grid.v1');
  const [products, categories] = await Promise.all([
    needsProducts ? getProducts({ pageSize: 24 }) : Promise.resolve(null),
    needsCategories ? getCategories() : Promise.resolve(null),
  ]);
  const colors = theme.document.global.designTokens.colors ?? {};
  const primary = safeColor(colors.primary, '#6D28D9');
  const background = safeColor(colors.background, '#FFFFFF');
  const foreground = safeColor(colors.text, '#0F172A');
  const fontToken = theme.document.global.designTokens.typography?.fontFamily;
  const fontFamily = fontToken === 'serif' ? 'Georgia, serif' : fontToken === 'sans-serif' ? 'Arial, sans-serif' : 'system-ui, sans-serif';

  return <div style={{ backgroundColor: background, color: foreground, fontFamily }}>
    {sections.map(section => {
      const content = <ThemeHomeSection key={section.id} section={section} store={store} products={products} categories={categories} primary={primary} globalSettings={theme.document.global.settings} />;
      const visibility = visibilityClass(section.settings.visibility);
      return visibility ? <div key={section.id} className={visibility}>{content}</div> : content;
    })}
  </div>;
}

async function ThemeHomeSection({ section, store, products, categories, primary, globalSettings }: {
  section: ThemeSectionInstance;
  store: StoreInfo;
  products: Awaited<ReturnType<typeof getProducts>> | null;
  categories: Awaited<ReturnType<typeof getCategories>> | null;
  primary: string;
  globalSettings: Record<string, unknown>;
}) {
  const settings = section.settings;
  switch (section.type) {
    case 'storeos.announcement.v1': {
      // O aviso geral já aparece na faixa do topo de todas as páginas; aqui só um texto próprio desta seção.
      const message = text(settings.text);
      if (!message || message === text(globalSettings.announcementText) || globalSettings.showAnnouncement === false) return null;
      return <div className="px-4 py-2 text-center text-sm font-medium text-white" style={{ backgroundColor: primary }}>
        {settings.linkUrl ? <Link href={text(settings.linkUrl, '/')} className="underline underline-offset-2">{message}</Link> : message}
      </div>;
    }
    case 'storeos.header.v1':
      return <Header />;
    case 'storeos.hero.v1': {
      const imageUrl = text(settings.imageUrl);
      const mobileImageUrl = text(settings.mobileImageUrl);
      const centered = settings.mobileAlign === 'center';
      return <section className="shell grid gap-8 py-10 md:grid-cols-2 md:items-center md:py-16">
        <div className={centered ? 'text-center md:text-left' : undefined}>
          {settings.eyebrow && <p className="mb-3 text-sm font-semibold uppercase tracking-wider" style={{ color: primary }}>{text(settings.eyebrow)}</p>}
          <h1 className="text-3xl font-bold leading-tight md:text-5xl">{text(settings.title, store.name)}</h1>
          {settings.subtitle && <p className={'mt-4 max-w-xl text-lg opacity-80' + (centered ? ' mx-auto md:mx-0' : '')}>{text(settings.subtitle)}</p>}
          {settings.ctaLabel && <Link href={text(settings.ctaUrl, '/categorias')} className="mt-6 inline-flex rounded-lg px-5 py-3 font-semibold text-white" style={{ backgroundColor: primary }}>{text(settings.ctaLabel)}</Link>}
        </div>
        {imageUrl || mobileImageUrl ? <div className="overflow-hidden rounded-2xl"><picture>
          {mobileImageUrl && imageUrl && <source media="(max-width: 767px)" srcSet={mobileImageUrl} />}
          <img src={imageUrl || mobileImageUrl} alt={text(settings.title, store.name)} className="max-h-[520px] w-full object-cover" />
        </picture></div> : <div className="hidden min-h-64 items-center justify-center rounded-2xl bg-slate-100 text-6xl md:flex" aria-hidden>✦</div>}
        {section.blocks.some(block => block.enabled) && <ul className="flex flex-wrap gap-3 md:col-span-2">{section.blocks.filter(block => block.enabled).map(block => <li key={block.id} className="rounded-full border px-4 py-2 text-sm">{text(block.settings.title)}{block.settings.text ? ` · ${text(block.settings.text)}` : ''}</li>)}</ul>}
      </section>;
    }
    case 'storeos.category-grid.v1':
      return <section className="shell py-8 md:py-12">
        <SectionHeading title={text(settings.heading, 'Compre por categoria')} subtitle={text(settings.subheading)} />
        <div className={'grid gap-3 ' + gridColumns(columns(settings.mobileColumns, 1, 3), columns(settings.columns, 2, 6), { mobile: 2, desktop: 4 })}>{(categories ?? []).slice(0, 12).map(category => <Link key={category.id} href={'/categorias/' + encodeURIComponent(category.slug)} className="rounded-xl border bg-white p-5 text-center font-semibold shadow-sm hover:shadow-md">{category.name}</Link>)}</div>
        {categories?.length === 0 && <p className="text-sm text-slate-500">As categorias aparecerão aqui quando forem cadastradas.</p>}
      </section>;
    case 'storeos.product-collection.v1':
      return <section className="shell py-8 md:py-12">
        <SectionHeading title={text(settings.heading, 'Destaques da loja')} subtitle={text(settings.subheading)} />
        {products && <ProductGrid page={{ ...products, items: products.items.slice(0, Math.max(1, Math.min(24, Number(settings.limit) || 8))) }} basePath="/categorias" empty="Os produtos publicados aparecerão nesta vitrine." columns={gridColumns(columns(settings.mobileColumns, 1, 2), columns(settings.columns, 2, 6), { mobile: 2, desktop: 4 })} />}
      </section>;
    case 'storeos.benefits.v1':
      return <section className="shell grid gap-3 py-8 sm:grid-cols-2 lg:grid-cols-4">{section.blocks.filter(block => block.enabled).map(block => <article key={block.id} className="rounded-xl border p-4"><h2 className="font-semibold">{text(block.settings.title)}</h2><p className="mt-1 text-sm opacity-75">{text(block.settings.text)}</p></article>)}</section>;
    case 'storeos.rich-text.v1':
      return <section className="shell py-8"><h2 className="text-2xl font-bold">{text(settings.heading)}</h2><p className="mt-3 whitespace-pre-wrap leading-7">{text(settings.body)}</p></section>;
    case 'storeos.newsletter.v1':
      return <section className="shell py-8"><NewsletterForm /></section>;
    case 'storeos.footer.v1':
      // O rodapé configurável da loja já é desenhado pelo layout em todas as páginas.
      return null;
    default:
      // Seção ainda não conectada ao runtime público: não exibe conteúdo de demonstração nem texto de configuração.
      return null;
  }
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="mb-5"><h2 className="text-2xl font-bold">{title}</h2>{subtitle && <p className="mt-1 opacity-75">{subtitle}</p>}</div>;
}
