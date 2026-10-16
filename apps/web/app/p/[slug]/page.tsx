import type { Metadata } from 'next';
import { ContentPageView } from '../../../components/blog/content-page-view';
import { getPage } from '../../../lib/api';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await getPage((await params).slug);
  return page ? { title: page.title, description: page.seoDescription ?? undefined, alternates: { canonical: `/p/${page.slug}` } } : { title: 'Página não encontrada' };
}

export default async function ContentPage({ params }: Props) {
  return <ContentPageView slug={(await params).slug} />;
}
