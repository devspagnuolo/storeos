import Link from 'next/link';
import { adminFetch } from '../../../../lib/admin/session';
import type { FeedStatus } from '../../../../lib/admin/types';

export const dynamic = 'force-dynamic';

export default async function FeedsPage() {
  const feed = await adminFetch<FeedStatus>('/feeds/status');
  return (
    <>
      <h1 className="text-3xl font-bold">Google Shopping e Instagram</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">A loja gera sozinha a lista dos seus produtos ativos (com fotos, preço, tamanhos, cores e se tem estoque) no formato que o Google e o Meta pedem. Você só cola o endereço abaixo no Google Merchant Center e no Gerenciador de Catálogo do Meta; depois eles se atualizam sozinhos.</p>
      {!feed.siteConfigured && <p role="alert" className="mt-4 max-w-3xl rounded-xl bg-amber-50 p-3 text-sm text-amber-900">O endereço da loja ainda não está configurado (domínio próprio ou PUBLIC_SITE_URL). Sem ele os links dos produtos não saem corretos.</p>}
      <section className="card mt-6 space-y-5 p-6 text-sm">
        <div>
          <h2 className="text-lg font-bold">Google Merchant Center</h2>
          <p className="text-slate-500">Em Produtos &gt; Feeds &gt; Adicionar feed, escolha “Busca programada” e cole este endereço (arquivo XML).</p>
          <input readOnly value={feed.google} className="input mt-2 w-full font-mono text-xs" aria-label="Endereço para o Google" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Instagram e Facebook (Meta)</h2>
          <p className="text-slate-500">No Gerenciador de Catálogo, adicione itens com “Feed de dados” e cole este endereço (planilha CSV).</p>
          <input readOnly value={feed.meta} className="input mt-2 w-full font-mono text-xs" aria-label="Endereço para o Meta" />
        </div>
        {!feed.apiConfigured && <p className="text-xs text-slate-500">O endereço acima ainda está sem o domínio da API (API_PUBLIC_URL). Se o Google não conseguir abrir, peça para configurar essa variável.</p>}
      </section>
      <section className="card mt-6 p-6">
        <h2 className="text-lg font-bold">Qualidade dos produtos</h2>
        {feed.products === 0 ? <p className="mt-2 text-sm text-slate-500">Nenhum produto ativo ainda.</p> : feed.counts.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Os {feed.products} produtos ativos estão completos.</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-600">{feed.products} produtos ativos.{feed.withoutPhoto > 0 && ` ${feed.withoutPhoto} sem foto não entram na lista.`}</p>
            <ul className="mt-3 flex flex-wrap gap-2 text-xs">{feed.counts.map(c => <li key={c.key} className="rounded-full bg-amber-50 px-3 py-1 text-amber-900">{c.label}: {c.count}</li>)}</ul>
            <table className="mt-4 w-full text-sm"><tbody className="divide-y">{feed.list.map(p => (
              <tr key={p.id}><td className="py-2 pr-4"><Link href={`/painel/produtos/${p.id}`} className="font-medium underline">{p.name}</Link></td><td className="py-2 text-xs text-slate-500">{p.labels.join(' · ')}</td></tr>))}</tbody></table>
          </>)}
      </section>
    </>
  );
}
