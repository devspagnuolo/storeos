import Link from 'next/link';
import { FooterForm } from '../../../../components/admin/footer-form';
import { adminFetch } from '../../../../lib/admin/session';
import type { AdminPage } from '../../../../lib/admin/types';
import type { FooterConfig } from '../../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function FooterPage() {
  const [{ footer, whatsappNumber }, pages] = await Promise.all([
    adminFetch<{ footer: FooterConfig; whatsappNumber: string | null }>('/store/footer'),
    adminFetch<AdminPage[]>('/content/admin/pages'),
  ]);
  const footerPages = pages.filter(page => page.published && page.showInFooter).map(page => page.title);
  return (
    <>
      <h1 className="text-3xl font-bold">Rodapé</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">O rodapé aparece no fim de todas as páginas da loja, em colunas. Ligue as seções que quer mostrar, dê o título de cada uma e preencha as informações da loja. Os links dos departamentos vêm do <Link href="/painel/menus?menu=footer" className="font-medium text-brand underline">menu do rodapé</Link> (ou das suas categorias, se ele não estiver montado).</p>
      <FooterForm footer={footer} whatsappNumber={whatsappNumber} footerPages={footerPages} />
    </>
  );
}
