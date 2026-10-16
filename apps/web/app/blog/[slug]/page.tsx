import type { Metadata } from 'next';
import { BlogPostView } from '../../../components/blog/blog-pages';
import { getPost } from '../../../lib/api';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost((await params).slug);
  if (!post) return { title: 'Artigo não encontrado' };
  return {
    title: post.title,
    description: post.seoDescription ?? post.excerpt ?? undefined,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: { type: 'article', title: post.title, ...(post.coverImageUrl && { images: [post.coverImageUrl] }), ...(post.publishedAt && { publishedTime: post.publishedAt }) },
  };
}

export default async function BlogPostPage({ params }: Props) {
  return <BlogPostView slug={(await params).slug} />;
}
