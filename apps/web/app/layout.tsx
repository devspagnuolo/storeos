import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { StoreNameProvider } from '../components/store-name';
import { Footer } from '../components/footer';
import { WhatsAppButton } from '../components/whatsapp-button';
import { defaultMenu, getCategories, getMenu, getPages, getStore } from '../lib/api';
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
  const { name, faviconUrl } = await getPageBranding();
  return {
    title: { default: name, template: `%s | ${name}` },
    description: `Compre online na ${name}.`,
    icons: faviconUrl ? { icon: faviconUrl } : undefined,
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [{ name, logoUrl, whatsappNumber, whatsappMessage }, categories, pages, main, footer] = await Promise.all([getPageBranding(), getCategories(), getPages(), getMenu('main'), getMenu('footer')]);
  const menus = { main: main.configured ? main.items : defaultMenu(categories), footer: footer.configured ? footer.items : null };
  return <html lang="pt-BR"><body><StoreNameProvider name={name} logoUrl={logoUrl} menus={menus}>{children}<Footer categories={categories} pages={pages} /><WhatsAppButton number={whatsappNumber} message={whatsappMessage} /></StoreNameProvider></body></html>;
}
