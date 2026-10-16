import Link from 'next/link';
import type { ThemeDocument, ThemeSectionInstance } from '@storeos/contracts';
import { Header } from '../header';
import { NewsletterForm } from '../newsletter-form';
import { ProductGrid } from '../product-grid';
import { getCategories, getProducts, type StoreInfo } from '../../lib/api';
import { gridColumns, visibilityClass } from '../../lib/responsive-grid';
import { productSource, videoEmbedUrl } from '../../lib/engine-media';
import { EngineCarousel } from './engine-carousel';

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
      // Com "Outro banner" adicionado, o banner principal vira um carrossel: ele mesmo primeiro, depois os outros.
      const extra = section.blocks.filter(block => block.enabled && block.type === 'storeos.hero.slide.v1');
      if (extra.length) {
        const slides = [
          { id: section.id, imageUrl, mobileImageUrl, title: text(settings.title, store.name), subtitle: text(settings.subtitle), ctaLabel: text(settings.ctaLabel), ctaUrl: text(settings.ctaUrl, '/categorias'), light: false },
          ...extra.map(block => ({ id: block.id, imageUrl: text(block.settings.imageUrl), mobileImageUrl: text(block.settings.mobileImageUrl), title: text(block.settings.title), subtitle: text(block.settings.subtitle), ctaLabel: text(block.settings.ctaLabel), ctaUrl: text(block.settings.ctaUrl), light: block.settings.textTone === 'light' })),
        ];
        const highlights = section.blocks.filter(block => block.enabled && block.type === 'storeos.hero.highlight.v1');
        return <>
          <EngineCarousel slides={slides} autoplay={settings.autoplay !== false} interval={columns(settings.interval, 3, 10) ?? 6} large primary={primary} />
          {highlights.length > 0 && <ul className="shell flex flex-wrap gap-3 py-4">{highlights.map(block => <li key={block.id} className="rounded-full border px-4 py-2 text-sm">{text(block.settings.title)}{block.settings.text ? ` · ${text(block.settings.text)}` : ''}</li>)}</ul>}
        </>;
      }
      return <section className="shell grid gap-8 py-10 md:grid-cols-2 md:items-center md:py-16">
        <div className={centered ? 'text-center md:text-left' : undefined}>
          {settings.eyebrow && <p className="mb-3 text-sm font-semibold uppercase tracking-wider" style={{ color: primary }}>{text(settings.eyebrow)}</p>}
          <h1 className="text-3xl font-bold leading-tight md:text-5xl">{text(settings.title, store.name)}</h1>
          {settings.subtitle && <p className={'mt-4 max-w-xl text-lg opacity-80' + (centered ? ' mx-auto md:mx-0' : '')}>{text(settings.subtitle)}</p>}
          {settings.ctaLabel && <Link href={text(settings.ctaUrl, '/categorias')} className="mt-6 inline-flex rounded-lg px-5 py-3 font-semibold text-white" style={{ backgroundColor: primary }}>{text(settings.ctaLabel)}</Link>}
        </div>
        {imageUrl || mobileImageUrl ? <div className="overflow-hidden rounded-2xl"><picture>
          {mobileImageUrl && imageUrl && <source media="(max-width: 767px)" srcSet={mobileImageUrl} />}
          <img src={imageUrl || mobileImageUrl} alt={text(settings.title, store.name)} className="mx-auto block h-auto max-h-[85vh] w-full object-contain" />
        </picture></div> : <div className="hidden min-h-64 items-center justify-center rounded-2xl bg-slate-100 text-6xl md:flex" aria-hidden>✦</div>}
        {section.blocks.some(block => block.enabled) && <ul className="flex flex-wrap gap-3 md:col-span-2">{section.blocks.filter(block => block.enabled && block.type !== 'storeos.hero.slide.v1').map(block => <li key={block.id} className="rounded-full border px-4 py-2 text-sm">{text(block.settings.title)}{block.settings.text ? ` · ${text(block.settings.text)}` : ''}</li>)}</ul>}
      </section>;
    }
    case 'storeos.category-grid.v1':
      return <section className="shell py-8 md:py-12">
        <SectionHeading title={text(settings.heading, 'Compre por categoria')} subtitle={text(settings.subheading)} />
        <div className={'grid gap-3 ' + gridColumns(columns(settings.mobileColumns, 1, 3), columns(settings.columns, 2, 6), { mobile: 2, desktop: 4 })}>{(categories ?? []).slice(0, 12).map(category => <Link key={category.id} href={'/categorias/' + encodeURIComponent(category.slug)} className="rounded-xl border bg-white p-5 text-center font-semibold shadow-sm hover:shadow-md">{category.name}</Link>)}</div>
        {categories?.length === 0 && <p className="text-sm text-slate-500">As categorias aparecerão aqui quando forem cadastradas.</p>}
      </section>;
    case 'storeos.product-collection.v1': {
      const limit = Math.max(1, Math.min(24, Number(settings.limit) || 8));
      // Vitrine de uma categoria ou coleção escolhida no tema; sem escolha, os produtos mais recentes.
      const source = productSource(settings.sourceUrl);
      const list = source ? await getProducts({ ...source, pageSize: limit }) : products;
      const viewAll = source ? text(settings.sourceUrl) : '/categorias';
      return <section className="shell py-8 md:py-12">
        <div className="flex flex-wrap items-end justify-between gap-3"><SectionHeading title={text(settings.heading, 'Destaques da loja')} subtitle={text(settings.subheading)} />{settings.showViewAll === true && <Link href={viewAll} className="mb-5 text-sm font-semibold underline-offset-4 hover:underline" style={{ color: primary }}>Ver todos →</Link>}</div>
        {list && <ProductGrid page={{ ...list, total: Math.min(list.total, limit), items: list.items.slice(0, limit) }} basePath="/categorias" empty="Os produtos publicados aparecerão nesta vitrine." columns={gridColumns(columns(settings.mobileColumns, 1, 2), columns(settings.columns, 2, 6), { mobile: 2, desktop: 4 })} />}
      </section>;
    }
    case 'storeos.carousel.v1': {
      const slides = section.blocks.filter(block => block.enabled).map(block => ({ id: block.id, imageUrl: text(block.settings.imageUrl), mobileImageUrl: text(block.settings.mobileImageUrl), title: text(block.settings.title), subtitle: text(block.settings.subtitle), ctaLabel: text(block.settings.ctaLabel), ctaUrl: text(block.settings.ctaUrl), light: block.settings.textTone === 'light' }));
      if (!slides.length) return null;
      return <EngineCarousel slides={slides} autoplay={settings.autoplay === true} interval={columns(settings.interval, 3, 10) ?? 6} large={settings.height !== 'medium'} primary={primary} />;
    }
    case 'storeos.image.v1': {
      const tiles = section.blocks.filter(block => block.enabled);
      if (!tiles.length) return null;
      const perRow = columns(settings.columns, 1, 4) ?? 2;
      return <section className="shell py-8 md:py-12">
        {text(settings.heading) && <SectionHeading title={text(settings.heading)} subtitle="" />}
        <div className={'grid gap-4 ' + TILE_COLUMNS[perRow]}>
          {tiles.map(block => {
            const image = text(block.settings.imageUrl);
            const label = text(block.settings.label);
            const body = <div className="relative flex aspect-[16/9] items-end overflow-hidden rounded-2xl" style={image ? undefined : { background: `linear-gradient(135deg, ${primary}1f, ${primary}4d)` }}>
              {image && <img src={image} alt={text(block.settings.alt, label)} className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />}
              {label && <span className="relative m-4 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-slate-900">{label}</span>}
            </div>;
            const href = text(block.settings.linkUrl);
            return href ? <Link key={block.id} href={href} className="group block" aria-label={label || text(block.settings.alt) || undefined}>{body}</Link> : <div key={block.id}>{body}</div>;
          })}
        </div>
      </section>;
    }
    case 'storeos.testimonials.v1': {
      const items = section.blocks.filter(block => block.enabled && text(block.settings.text));
      if (!items.length) return null;
      return <section className="shell py-8 md:py-12">
        <SectionHeading title={text(settings.heading, 'O que dizem nossas clientes')} subtitle={text(settings.subheading)} />
        <div className="grid gap-4 md:grid-cols-3">{items.map(block => {
          const rating = columns(block.settings.rating, 1, 5) ?? 5;
          return <figure key={block.id} className="rounded-2xl border bg-white/60 p-5">
            <p aria-label={`${rating} de 5 estrelas`} style={{ color: primary }}>{'★'.repeat(rating)}<span className="opacity-30">{'★'.repeat(5 - rating)}</span></p>
            <blockquote className="mt-3 leading-7">“{text(block.settings.text)}”</blockquote>
            <figcaption className="mt-4 text-sm font-semibold">{text(block.settings.name)}{text(block.settings.city) && <span className="font-normal opacity-70"> · {text(block.settings.city)}</span>}</figcaption>
          </figure>;
        })}</div>
      </section>;
    }
    case 'storeos.faq.v1': {
      const items = section.blocks.filter(block => block.enabled && text(block.settings.question));
      if (!items.length) return null;
      return <section className="shell max-w-3xl py-8 md:py-12">
        <SectionHeading title={text(settings.heading, 'Perguntas frequentes')} subtitle="" />
        <div className="divide-y rounded-2xl border">{items.map(block => <details key={block.id} className="group p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">{text(block.settings.question)}<span aria-hidden className="transition-transform group-open:rotate-45">+</span></summary>
          <p className="mt-3 whitespace-pre-wrap leading-7 opacity-80">{text(block.settings.answer)}</p>
        </details>)}</div>
      </section>;
    }
    case 'storeos.video.v1': {
      const embed = videoEmbedUrl(settings.videoUrl);
      if (!embed) return null;
      return <section className="shell py-8 md:py-12">
        {text(settings.heading) && <SectionHeading title={text(settings.heading)} subtitle="" />}
        <div className="aspect-video overflow-hidden rounded-2xl bg-black"><iframe src={embed} title={text(settings.heading, 'Vídeo da loja')} className="h-full w-full" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div>
        {text(settings.caption) && <p className="mt-3 text-sm opacity-75">{text(settings.caption)}</p>}
      </section>;
    }
    case 'storeos.benefits.v1': {
      const items = section.blocks.filter(block => block.enabled);
      if (!items.length) return null;
      if (settings.style === 'cards') return <section className="shell grid gap-3 py-8 sm:grid-cols-2 lg:grid-cols-4">{items.map(block => <article key={block.id} className="rounded-xl border p-5"><BenefitIcon name={block.settings.icon} color={primary} /><h2 className="mt-3 font-semibold">{text(block.settings.title)}</h2><p className="mt-1 text-sm opacity-75">{text(block.settings.text)}</p></article>)}</section>;
      return <section className="border-y bg-white/50"><ul className="shell grid grid-cols-2 gap-x-4 gap-y-3 py-4 lg:grid-cols-4">{items.map(block => <li key={block.id} className="flex min-w-0 items-center gap-3"><BenefitIcon name={block.settings.icon} color={primary} /><span className="min-w-0"><strong className="block truncate text-sm">{text(block.settings.title)}</strong><span className="block truncate text-xs opacity-70">{text(block.settings.text)}</span></span></li>)}</ul></section>;
    }
    case 'storeos.rich-text.v1': {
      const centered = settings.align === 'center';
      return <section className={'shell py-8 md:py-12 ' + (centered ? 'text-center' : '')}><div className={centered ? 'mx-auto max-w-3xl' : 'max-w-3xl'}>{text(settings.heading) && <h2 className="text-2xl font-bold md:text-3xl">{text(settings.heading)}</h2>}<p className="mt-3 whitespace-pre-wrap text-lg leading-8 opacity-85">{text(settings.body)}</p></div></section>;
    }
    case 'storeos.newsletter.v1':
      return <section className="shell py-8 md:py-12"><div className="mx-auto max-w-2xl rounded-2xl border bg-white/60 p-6 text-center md:p-10">{text(settings.heading) && <h2 className="text-2xl font-bold">{text(settings.heading)}</h2>}{text(settings.text) && <p className="mt-2 opacity-75">{text(settings.text)}</p>}<div className="mx-auto mt-4 max-w-md text-left"><NewsletterForm /></div></div></section>;
    case 'storeos.footer.v1':
      // O rodapé configurável da loja já é desenhado pelo layout em todas as páginas.
      return null;
    default:
      // Seção ainda não conectada ao runtime público: não exibe conteúdo de demonstração nem texto de configuração.
      return null;
  }
}

const TILE_COLUMNS: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-1 sm:grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3', 4: 'grid-cols-2 lg:grid-cols-4' };

const ICONS: Record<string, React.ReactNode> = {
  truck: <path d="M3 7h11v8H3zM14 10h4l3 3v2h-7M7 18a1.5 1.5 0 1 0 0-.01M17 18a1.5 1.5 0 1 0 0-.01" />,
  card: <path d="M3 6h18v12H3zM3 10h18M7 15h3" />,
  shield: <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Zm-3 9 2 2 4-4" />,
  return: <path d="M4 9h11a5 5 0 0 1 0 10H8M4 9l4-4M4 9l4 4" />,
  chat: <path d="M4 5h16v11H8l-4 4V5Z" />,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />,
  pix: <path d="m12 3 9 9-9 9-9-9 9-9Zm-4.5 9h9" />,
  gift: <path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0" />,
};

/** Ícones fixos do runtime (o tema só escolhe o nome): nada de SVG vindo do tema. */
function BenefitIcon({ name, color }: { name: unknown; color: string }) {
  const icon = ICONS[typeof name === 'string' ? name : ''] ?? ICONS.star;
  return <svg viewBox="0 0 24 24" className="h-7 w-7 shrink-0" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{icon}</svg>;
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="mb-5"><h2 className="text-2xl font-bold">{title}</h2>{subtitle && <p className="mt-1 opacity-75">{subtitle}</p>}</div>;
}
