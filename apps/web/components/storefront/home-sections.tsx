import Link from 'next/link';
import { BannerCarousel } from '../banner-carousel';
import { NewsletterForm } from '../newsletter-form';
import { ProductCard } from '../product-card';
import { getBanners, getCategories, getProducts, type HomeSection, type SectionProps } from '../../lib/api';
import { ImageCarousel } from './image-carousel';

const cls = (...items: (string | false | undefined)[]) => items.filter(Boolean).join(' ');
const Wrap = ({ children, tone }: { children: React.ReactNode; tone?: 'plain' | 'band' }) => (
  <section className={tone === 'band' ? 'border-y bg-surface' : undefined}><div className="shell" style={{ paddingBlock: 'var(--section-y, 4rem)' }}>{children}</div></section>
);
const Heading = ({ eyebrow, title, center }: { eyebrow?: string; title?: string; center?: boolean }) => (!eyebrow && !title ? null : (
  <div className={cls('mb-8', center && 'text-center')}>{eyebrow && <p className="text-sm font-semibold text-brand">{eyebrow}</p>}{title && <h2 className="text-3xl font-bold">{title}</h2>}</div>
));
function Linked({ href, children, label }: { href?: string | null; children: React.ReactNode; label?: string }) {
  if (!href) return <>{children}</>;
  return /^https:/.test(href) ? <a href={href} rel="noopener noreferrer" aria-label={label || undefined}>{children}</a> : <Link href={href} aria-label={label || undefined}>{children}</Link>;
}

async function Banners() {
  const banners = await getBanners();
  return banners.length ? <BannerCarousel slides={banners} /> : null;
}

function Hero({ p }: { p: SectionProps }) {
  return <section className="bg-ink text-white"><div className="shell grid min-h-[440px] items-center gap-10 md:grid-cols-2" style={{ paddingBlock: 'var(--section-y, 4rem)' }}>
    <div><h1 className="text-4xl font-black leading-tight sm:text-6xl">{p.title}</h1>{p.description && <p className="mt-6 max-w-lg text-slate-300">{p.description}</p>}
      {p.cta && <Linked href={p.ctaHref ?? '/categorias'}><span className="button mt-8">{p.cta}</span></Linked>}</div>
    <div className="aspect-[4/3] overflow-hidden rounded-3xl bg-brand p-2">{p.imageUrl ? <img src={p.imageUrl} alt={p.imageAlt ?? ''} className="h-full w-full rounded-2xl object-cover" /> : <div className="h-full rounded-2xl border border-white/30 bg-white/10" />}</div>
  </div></section>;
}

function ImageBlock({ p }: { p: SectionProps }) {
  const picture = <picture>{p.mobileImageUrl && <source media="(max-width: 767px)" srcSet={p.mobileImageUrl} />}<img src={p.imageUrl} alt={p.alt ?? ''} loading="lazy" className="h-auto w-full object-cover" /></picture>;
  return <section><Linked href={p.href} label={p.alt}>{picture}</Linked></section>;
}

function TextBlock({ p }: { p: SectionProps }) {
  return <Wrap><div className={cls('mx-auto max-w-3xl', p.align === 'center' && 'text-center')}>{p.heading && <h2 className="text-3xl font-bold">{p.heading}</h2>}{p.body && <p className="mt-4 whitespace-pre-line text-slate-600">{p.body}</p>}</div></Wrap>;
}

async function Categories({ p }: { p: SectionProps }) {
  const roots = (await getCategories()).filter(c => !c.parentId).slice(0, p.limit ?? 6);
  if (!roots.length) return null;
  return <Wrap><Heading title={p.heading} /><ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">{roots.map(c => (
    <li key={c.id}><Link href={`/categorias/${c.slug}`} className="card group block overflow-hidden text-center">
      <div className="aspect-square bg-slate-100">{c.bannerUrl && <img src={c.bannerMobileUrl ?? c.bannerUrl} alt="" loading="lazy" className="h-full w-full object-cover" />}</div>
      <p className="p-3 font-semibold group-hover:text-brand">{c.name}</p></Link></li>))}</ul></Wrap>;
}

async function Products({ p }: { p: SectionProps }) {
  const { items } = await getProducts({ pageSize: p.limit ?? 8, ...(p.categorySlug ? { category: p.categorySlug } : {}) });
  return <Wrap>
    <div className="mb-8 flex items-end justify-between"><div>{p.subheading && <p className="text-sm font-semibold text-brand">{p.subheading}</p>}{p.heading && <h2 className="text-3xl font-bold">{p.heading}</h2>}</div>
      <Link href={p.categorySlug ? `/categorias/${p.categorySlug}` : '/categorias'} className="font-medium text-brand">Ver todos →</Link></div>
    {items.length ? <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{items.map(product => <ProductCard product={product} key={product.id} />)}</div>
      : <div className="card p-10 text-center text-slate-500">Os produtos aparecerão aqui assim que forem publicados.</div>}
  </Wrap>;
}

function Benefits({ p }: { p: SectionProps }) {
  const items: { title: string; text?: string }[] = p.items ?? [];
  return <Wrap tone="band"><ul className={cls('grid gap-6 text-center', items.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2')}>{items.map((item, i) => <li key={i}><b>{item.title}</b>{item.text && <p className="text-sm text-slate-500">{item.text}</p>}</li>)}</ul></Wrap>;
}

function Testimonials({ p }: { p: SectionProps }) {
  const items: { name: string; text: string }[] = p.items ?? [];
  return <Wrap><Heading title={p.heading} center /><ul className="grid gap-4 md:grid-cols-3">{items.map((item, i) => <li key={i} className="card p-6"><blockquote className="text-slate-700">“{item.text}”</blockquote><p className="mt-4 text-sm font-semibold">{item.name}</p></li>)}</ul></Wrap>;
}

function Newsletter({ p }: { p: SectionProps }) {
  return <Wrap tone="band"><div className="mx-auto max-w-xl text-center">{p.heading && <h2 className="text-2xl font-bold">{p.heading}</h2>}{p.text && <p className="mt-2 text-slate-600">{p.text}</p>}<NewsletterForm /></div></Wrap>;
}

export function videoSrc(p: SectionProps) {
  if (p.provider === 'youtube' && /^[\w-]{11}$/.test(p.videoId)) return `https://www.youtube-nocookie.com/embed/${p.videoId}`;
  if (p.provider === 'vimeo' && /^\d{6,12}$/.test(p.videoId)) return `https://player.vimeo.com/video/${p.videoId}`;
  return null;
}
function Video({ p }: { p: SectionProps }) {
  const src = videoSrc(p);
  if (!src) return null;
  return <Wrap><div className="mx-auto aspect-video max-w-4xl overflow-hidden rounded-2xl bg-black"><iframe src={src} title={p.title || 'Vídeo da loja'} loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation" className="h-full w-full border-0" /></div></Wrap>;
}

export function HomeSections({ sections }: { sections: HomeSection[] }) {
  return <>{sections.filter(s => !s.hidden).map(s => {
    switch (s.type) {
      case 'banners': return <Banners key={s.id} />;
      case 'hero': return <Hero key={s.id} p={s.props} />;
      case 'image': return s.props.imageUrl ? <ImageBlock key={s.id} p={s.props} /> : null;
      case 'carousel': return s.props.slides?.length ? <ImageCarousel key={s.id} slides={s.props.slides} autoplay={s.props.autoplay !== false} /> : null;
      case 'text': return <TextBlock key={s.id} p={s.props} />;
      case 'categories': return <Categories key={s.id} p={s.props} />;
      case 'products': return <Products key={s.id} p={s.props} />;
      case 'benefits': return <Benefits key={s.id} p={s.props} />;
      case 'testimonials': return <Testimonials key={s.id} p={s.props} />;
      case 'newsletter': return <Newsletter key={s.id} p={s.props} />;
      case 'video': return <Video key={s.id} p={s.props} />;
      default: return null;
    }
  })}</>;
}
