import { Header } from '../header';
import { HomeSections } from './home-sections';
import { getBanners, type StorefrontConfig } from '../../lib/api';
import { effectiveSections } from '../../lib/storefront-model';

/** Página inicial montada a partir da configuração (publicada na loja, rascunho na prévia do painel). */
export async function StorefrontHome({ theme }: { theme: StorefrontConfig }) {
  const hasBanners = theme.home ? true : (await getBanners()).length > 0;
  const sections = effectiveSections(theme, hasBanners);
  return <>
    <Header />
    {theme.announcementText && <div className="bg-brand px-4 py-2 text-center text-sm font-medium text-brand-fg">{theme.announcementText}</div>}
    <main><HomeSections sections={sections} /></main>
  </>;
}
