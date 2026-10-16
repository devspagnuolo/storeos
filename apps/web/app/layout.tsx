import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { StoreNameProvider } from '../components/store-name';
import { TrackingScripts } from '../components/tracking-scripts';
import { resolveSiteUrl } from '../lib/store-host';
import { Footer } from '../components/footer';
import { TopBar } from '../components/storefront/top-bar';
import { WhatsAppButton } from '../components/whatsapp-button';
import { defaultMenu, getCategories, getMenu, getPages, getPosts, getStore } from '../lib/api';
import { engineStyle } from '../lib/theme-engine';
import { themeAttributes, themeStyle } from '../lib/theme';
import './globals.css';

const viviHosts = new Set(['vivimodaplussize.com.br', 'www.vivimodaplussize.com.br']);
const viviLogo = '/brand/vivi-moda-plus-size.png';

async function getPageBranding() {
  const requestHeaders = await headers();
  const host = (requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? '')
    .split(',')[0]
    .trim()
    .split(':')[0]
    .toLowerCase();
  const store = await getStore();

  if (!viviHosts.has(host)) return store;

  return {
    ...store,
    logoUrl: store.logoUrl ?? viviLogo,
    faviconUrl: store.faviconUrl ?? viviLogo,
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const { name, faviconUrl: storeFavicon, themeConfig, marketing } = await getPageBranding();
  const faviconUrl = themeConfig?.design?.faviconUrl ?? storeFavicon;
  const description = marketing?.homeDescription ?? `Compre online na ${name}.`;
  const title = marketing?.homeTitle ?? name;
  return {
    metadataBase: new URL(await resolveSiteUrl()),
    title: { default: title, template: `%s | ${name}` },
    description,
    icons: faviconUrl ? { icon: faviconUrl } : undefined,
    verification: marketing?.googleVerification ? { google: marketing.googleVerification } : undefined,
    openGraph: { siteName: name, locale: 'pt_BR', type: 'website', title, description },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [{ name, logoUrl, whatsappNumber, whatsappMessage, themeConfig, slug, marketing, open, publishedTheme, freeShipping, footer: footerConfig }, categories, pages, main, footer, posts] = await Promise.all([getPageBranding(), getCategories(), getPages(), getMenu('main'), getMenu('footer'), getPosts({ limit: 1 })]);
  const menus = { main: main.configured ? main.items : defaultMenu(categories), footer: footer.configured ? footer.items : null };
  const design = themeConfig?.design;
  // Loja nova fica "em construção" até o lojista publicar; prévia, painel e cadastro continuam acessíveis.
  const path = (await headers()).get('x-pathname') ?? '/';
  const closed = open === false && !['/previa', '/criar-loja', '/admin', '/painel'].some(prefix => path === prefix || path.startsWith(`${prefix}/`));
  if (closed) return <html lang="pt-BR"><head><meta name="robots" content="noindex" /></head><body style={themeStyle(themeConfig ?? {})}><main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">{(design?.logoUrl ?? logoUrl) && <img src={design?.logoUrl ?? logoUrl ?? ''} alt={name} className="mb-6 max-h-24 w-auto" />}<h1 className="text-3xl font-bold">{name}</h1><p className="mt-3 max-w-md text-slate-600">Estamos preparando tudo com carinho. Nossa loja abre em breve!</p></main></body></html>;
  const siteUrl = await resolveSiteUrl();
  // Dados estruturados da loja: o Google passa a mostrar nome, logo e caixa de busca do site nos resultados.
  const jsonLd = [
    { '@context': 'https://schema.org', '@type': 'Organization', name, url: siteUrl, ...((design?.logoUrl ?? logoUrl) && { logo: design?.logoUrl ?? logoUrl }) },
    { '@context': 'https://schema.org', '@type': 'WebSite', name, url: siteUrl, potentialAction: { '@type': 'SearchAction', target: `${siteUrl}/busca?q={search_term_string}`, 'query-input': 'required name=search_term_string' } },
  ];
  const inAdmin = ['/painel', '/admin'].some(prefix => path === prefix || path.startsWith(`${prefix}/`));
  const attributes = themeAttributes(themeConfig ?? {});
  // A prévia do painel monta a própria faixa com o rascunho; o cadastro de loja não é vitrine.
  const showTopBar = !inAdmin && !['/previa', '/criar-loja'].some(prefix => path === prefix || path.startsWith(`${prefix}/`));
  const engineSettings = publishedTheme?.document.global.settings;
  const announcement = publishedTheme ? (engineSettings?.showAnnouncement === false ? '' : String(engineSettings?.announcementText ?? '')) : themeConfig?.announcementText;
  return <html lang="pt-BR"><body className={!inAdmin && attributes.dark ? 'dark' : undefined} data-hero={inAdmin ? undefined : attributes.heroTone} style={{ ...themeStyle(themeConfig ?? {}, { admin: inAdmin }), ...(inAdmin ? {} : engineStyle(publishedTheme?.document ?? null)) }}><TrackingScripts marketing={marketing} /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} /><StoreNameProvider name={name} slug={slug} logoUrl={design?.logoUrl ?? logoUrl} menus={menus}>{showTopBar && <TopBar announcement={announcement} freeShipping={freeShipping} />}{children}<Footer categories={categories} pages={pages} hasBlog={posts.total > 0} config={footerConfig} whatsappNumber={whatsappNumber} /><WhatsAppButton number={whatsappNumber} message={whatsappMessage} /></StoreNameProvider></body></html>;
}
