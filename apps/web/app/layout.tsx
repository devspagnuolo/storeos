import type { Metadata } from 'next';
import { StoreNameProvider } from '../components/store-name';
import { getStore } from '../lib/api';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const { name, faviconUrl } = await getStore();
  return {
    title: { default: name, template: `%s | ${name}` },
    description: `Compre online na ${name}.`,
    icons: faviconUrl ? { icon: faviconUrl } : undefined,
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { name, logoUrl } = await getStore();
  return <html lang="pt-BR"><body><StoreNameProvider name={name} logoUrl={logoUrl}>{children}</StoreNameProvider></body></html>;
}
