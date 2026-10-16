import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Header } from '../../../components/header';
import { getPage } from '../../../lib/api';
import { RichText } from '../../../components/rich-text';

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
          <div className="mt-6"><RichText source={page.body} /></div>
        </article>
      </main>
    </>
  );
}
