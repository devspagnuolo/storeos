import { StorefrontHome } from '../components/storefront/storefront-home';
import { getStore } from '../lib/api';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const store = await getStore();
  return <StorefrontHome theme={store.themeConfig ?? {}} />;
}
