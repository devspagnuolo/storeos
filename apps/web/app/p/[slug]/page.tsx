import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Header } from '../../../components/header';
import { getPage } from '../../../lib/api';
import { parseRichText } from '../../../lib/rich-text';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await getPage((await params).slug);
  return page ? { title: page.title, description: page.seoDescription ?? undefined, alternates: { canonical: `/p/${page.slug}` } } : { title: 'Página não encontrada' };
}

export default async function ContentPage({ params }: Props) {
  const page = await getPage((await params).slug);
  if (!page) notFound();
  return (
    <>
      <Header />
      <main className="shell py-12">
        <article className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-bold">{page.title}</h1>
          <div className="mt-6 space-y-4 leading-relaxed text-slate-700">
            {parseRichText(page.body).map((block, index) => {
              if (block.type === 'h2') return <h2 key={index} className="pt-4 text-xl font-bold text-slate-900">{block.text}</h2>;
              if (block.type === 'h3') return <h3 key={index} className="pt-2 text-lg font-semibold text-slate-900">{block.text}</h3>;
              if (block.type === 'ul') return <ul key={index} className="list-disc space-y-1 pl-6">{block.items.map((item, i) => <li key={i}>{item}</li>)}</ul>;
              return <p key={index}>{block.text}</p>;
            })}
          </div>
        </article>
      </main>
    </>
  );
}
