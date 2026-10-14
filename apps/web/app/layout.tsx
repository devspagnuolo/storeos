import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { StoreNameProvider } from '../components/store-name';
import { getStore } from '../lib/api';
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
  const { name, logoUrl } = await getPageBranding();
  return <html lang="pt-BR"><body><StoreNameProvider name={name} logoUrl={logoUrl}>{children}</StoreNameProvider></body></html>;
}
