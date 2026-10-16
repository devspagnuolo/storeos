import type { Metadata } from 'next';
import { BlogIndexView } from '../../components/blog/blog-pages';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Blog', alternates: { canonical: '/blog' } };

export default async function BlogPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Math.min(Math.max(Number((await searchParams).page) || 1, 1), 500);
  return <BlogIndexView page={page} />;
}
