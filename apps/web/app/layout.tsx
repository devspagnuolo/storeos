import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { StoreNameProvider } from '../components/store-name';
import { TrackingScripts } from '../components/tracking-scripts';
import { resolveSiteUrl } from '../lib/store-host';
import { Footer } from '../components/footer';
import { WhatsAppButton } from '../components/whatsapp-button';
import { defaultMenu, getCategories, getMenu, getPages, getStore } from '../lib/api';
import { themeStyle } from '../lib/theme';
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
  const [{ name, logoUrl, whatsappNumber, whatsappMessage, themeConfig, slug, marketing }, categories, pages, main, footer] = await Promise.all([getPageBranding(), getCategories(), getPages(), getMenu('main'), getMenu('footer')]);
  const menus = { main: main.configured ? main.items : defaultMenu(categories), footer: footer.configured ? footer.items : null };
  const design = themeConfig?.design;
  const siteUrl = await resolveSiteUrl();
  // Dados estruturados da loja: o Google passa a mostrar nome, logo e caixa de busca do site nos resultados.
  const jsonLd = [
    { '@context': 'https://schema.org', '@type': 'Organization', name, url: siteUrl, ...((design?.logoUrl ?? logoUrl) && { logo: design?.logoUrl ?? logoUrl }) },
    { '@context': 'https://schema.org', '@type': 'WebSite', name, url: siteUrl, potentialAction: { '@type': 'SearchAction', target: `${siteUrl}/busca?q={search_term_string}`, 'query-input': 'required name=search_term_string' } },
  ];
  return <html lang="pt-BR"><body style={themeStyle(themeConfig ?? {})}><TrackingScripts marketing={marketing} /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} /><StoreNameProvider name={name} slug={slug} logoUrl={design?.logoUrl ?? logoUrl} menus={menus}>{children}<Footer categories={categories} pages={pages} /><WhatsAppButton number={whatsappNumber} message={whatsappMessage} /></StoreNameProvider></body></html>;
}
