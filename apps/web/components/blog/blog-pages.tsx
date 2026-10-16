import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Header } from '../header';
import { RichText } from '../rich-text';
import { getPost, getPosts, type BlogPostSummary } from '../../lib/api';
import { activeEngineDocument, engineFlag, engineNumber, engineSection, engineText } from '../../lib/theme-engine';

const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(value)) : '';

function PostCard({ post }: { post: BlogPostSummary }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border bg-surface">
      {post.coverImageUrl && <Link href={`/blog/${post.slug}`} tabIndex={-1} aria-hidden><img src={post.coverImageUrl} alt="" className="aspect-[16/9] w-full object-cover" loading="lazy" /></Link>}
      <div className="flex flex-1 flex-col p-5">
        {post.publishedAt && <p className="text-xs text-slate-500">{dateLabel(post.publishedAt)}</p>}
        <h2 className="mt-1 text-lg font-bold"><Link href={`/blog/${post.slug}`} className="hover:underline">{post.title}</Link></h2>
        {post.excerpt && <p className="mt-2 flex-1 text-sm text-slate-600">{post.excerpt}</p>}
        <Link href={`/blog/${post.slug}`} className="mt-4 text-sm font-semibold text-brand">Ler artigo →</Link>
      </div>
    </article>
  );
}

/** Lista do blog. O tema escolhe o título e quantos artigos aparecem por página. */
export async function BlogIndexView({ page = 1 }: { page?: number }) {
  const settings = engineSection(await activeEngineDocument(), 'blog-index', 'storeos.blog-list.v1');
  const limit = engineNumber(settings?.limit, 1, 24) ?? 12;
  const posts = await getPosts({ limit, page });
  const pages = Math.max(Math.ceil(posts.total / limit), 1);
  return (
    <>
      <Header />
      <main className="shell py-12">
        <h1 className="text-3xl font-bold">{engineText(settings?.heading, 'Blog')}</h1>
        {posts.items.length
          ? <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{posts.items.map(post => <PostCard key={post.slug} post={post} />)}</div>
          : <p className="mt-8 rounded-2xl border bg-surface p-8 text-center text-slate-500">Ainda não há artigos publicados.</p>}
        {pages > 1 && (
          <nav aria-label="Páginas do blog" className="mt-10 flex flex-wrap justify-center gap-2">
            {Array.from({ length: pages }, (_, index) => index + 1).map(number => (
              <Link key={number} href={number === 1 ? '/blog' : `/blog?page=${number}`} aria-current={number === page ? 'page' : undefined} className={'rounded-lg border px-3 py-1.5 text-sm ' + (number === page ? 'bg-brand text-brand-fg' : '')}>{number}</Link>
            ))}
          </nav>
        )}
      </main>
    </>
  );
}

/** Artigo do blog. O tema decide se mostra autor e data; o texto vem sempre do painel. */
export async function BlogPostView({ slug }: { slug: string }) {
  const post = await getPost(slug);
  if (!post) notFound();
  const settings = engineSection(await activeEngineDocument(), 'blog-post', 'storeos.blog-post.v1');
  const showAuthor = engineFlag(settings?.showAuthor, true) && Boolean(post.authorName);
  const showDate = engineFlag(settings?.showDate, true) && Boolean(post.publishedAt);
  return (
    <>
      <Header />
      <main className="shell py-12">
        <article className="mx-auto max-w-3xl">
          <Link href="/blog" className="text-sm text-brand">← Blog</Link>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{post.title}</h1>
          {(showAuthor || showDate) && <p className="mt-3 text-sm text-slate-500">{[showAuthor && `Por ${post.authorName}`, showDate && dateLabel(post.publishedAt)].filter(Boolean).join(' · ')}</p>}
          {post.coverImageUrl && <img src={post.coverImageUrl} alt="" className="mt-6 aspect-[16/9] w-full rounded-2xl object-cover" />}
          <div className="mt-8"><RichText source={post.body} /></div>
        </article>
      </main>
    </>
  );
}
