import Link from 'next/link';
import { ManualOrderForm } from '../../../../../components/admin/manual-order-form';
import { adminFetch } from '../../../../../lib/admin/session';
import type { AdminProductPage } from '../../../../../lib/admin/types';

export const dynamic = 'force-dynamic';

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? '').trim().slice(0, 100);
  const data = await adminFetch<AdminProductPage>(`/catalog/admin/products?${new URLSearchParams({ page: '1', pageSize: '100', status: 'ACTIVE', ...(q && { q }) })}`);
  return (
    <>
      <Link href="/admin/pedidos" className="text-sm text-slate-500">← Pedidos</Link>
      <h1 className="mt-2 text-3xl font-bold">Novo pedido manual</h1>
      <p className="mt-2 max-w-2xl text-slate-600">Para vendas feitas por WhatsApp, telefone ou no balcão. O pedido usa o mesmo estoque, e-mails e fluxo de envio da loja.</p>
      <form method="get" className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="product-q" className="sr-only">Filtrar produtos</label>
        <input id="product-q" name="q" defaultValue={q} placeholder="Filtrar a lista de produtos" className="input mt-0 max-w-xs" />
        <button className="button-ghost">Filtrar</button>
        <span className="text-slate-500">{data.total > data.items.length ? `Mostrando ${data.items.length} de ${data.total}: use o filtro para achar os demais.` : `${data.total} produtos ativos.`}</span>
      </form>
      <ManualOrderForm key={q} products={data.items} />
    </>
  );
}
