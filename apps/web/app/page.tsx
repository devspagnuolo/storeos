import { StorefrontHome } from '../components/storefront/storefront-home';
import { ThemeEngineHome } from '../components/storefront/theme-engine-home';
import { getStore } from '../lib/api';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const store = await getStore();
  if (store.publishedTheme) return <ThemeEngineHome theme={store.publishedTheme} store={store} />;
  return <StorefrontHome theme={store.themeConfig ?? {}} />;
}
