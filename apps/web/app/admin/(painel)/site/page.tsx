import { StorefrontEditor } from '../../../../components/admin/storefront-editor';
import { adminFetch } from '../../../../lib/admin/session';
import type { StoreInfo } from '../../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function StorefrontPage() {
  const store = await adminFetch<StoreInfo>('/store');
  return (
    <>
      <p className="text-sm font-semibold text-brand">VITRINE</p>
      <h1 className="mt-1 text-3xl font-bold">Personalizar loja</h1>
      <p className="mt-2 max-w-3xl text-slate-600">Edite o conteúdo principal, escolha a imagem e ajuste a cor da sua marca. As alterações ficam salvas para esta loja e podem ser publicadas sem mexer em código.</p>
      <div className="mt-8"><StorefrontEditor config={store.themeConfig ?? {}} /></div>
    </>
  );
}
