import { PageForm } from '../../../../components/admin/page-form';
import { adminFetch } from '../../../../lib/admin/session';
import type { AdminPage } from '../../../../lib/admin/types';
import { deletePageAction } from '../../actions';

export const dynamic = 'force-dynamic';

const date = (value?: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value)) : '';

export default async function BlogAdminPage() {
  const posts = await adminFetch<AdminPage[]>('/content/admin/pages?kind=POST');
  return (
    <>
      <h1 className="text-3xl font-bold">Blog</h1>
      <p className="mt-1 text-sm text-slate-500">Dicas de moda, novidades e bastidores da loja. Cada artigo fica em /blog/endereço e a lista completa em <a href="/blog" target="_blank" rel="noreferrer" className="text-brand underline">/blog ↗</a>. A data do artigo é a da primeira publicação.</p>
      <details className="card mt-8 p-6" open={!posts.length}>
        <summary className="cursor-pointer text-lg font-bold">+ Novo artigo</summary>
        <div className="mt-5"><PageForm kind="POST" /></div>
      </details>
      <div className="mt-6 space-y-4">
        {posts.map(post => (
          <details key={post.id} className="card p-5">
            <summary className="cursor-pointer font-bold">{post.title} <span className="ml-2 text-xs font-normal text-slate-500">/blog/{post.slug} · {post.published ? `publicado ${date(post.publishedAt)}` : 'rascunho'}</span></summary>
            <div className="mt-4"><PageForm page={post} kind="POST" /></div>
            <form action={deletePageAction} className="mt-3"><input type="hidden" name="id" value={post.id} /><button className="text-xs text-red-700 underline">Excluir artigo</button></form>
          </details>))}
        {!posts.length && <p className="card p-8 text-center text-slate-500">Nenhum artigo ainda. Escreva o primeiro acima.</p>}
      </div>
    </>
  );
}
