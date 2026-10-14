import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductForm } from '../../../../../components/admin/product-form';
import { adminBrands, adminCategories } from '../../../../../lib/admin/categories';
import { adminFetch, ApiError } from '../../../../../lib/admin/session';
import type { AdminProduct } from '../../../../../lib/admin/types';

export const dynamic = 'force-dynamic';

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ criado?: string }> }) {
  const { id } = await params;
  const [product, categories, brands] = await Promise.all([
    adminFetch<AdminProduct>(`/catalog/admin/products/${encodeURIComponent(id)}`).catch(error => { if (error instanceof ApiError && error.status === 404) notFound(); throw error; }),
    adminCategories(),
    adminBrands(),
  ]);
  return (
    <>
      <Link href="/admin/produtos" className="text-sm text-slate-500">← Produtos</Link>
      <div className="mb-8 mt-2 flex flex-wrap items-center justify-between gap-4"><h1 className="text-3xl font-bold">{product.name}</h1>{product.status === 'ACTIVE' && <Link href={`/produto/${product.slug}`} className="text-sm font-medium text-brand">Ver na loja →</Link>}</div>
      <ProductForm key={product.updatedAt} product={product} categories={categories} brands={brands} created={(await searchParams).criado === '1'} />
    </>
  );
}
