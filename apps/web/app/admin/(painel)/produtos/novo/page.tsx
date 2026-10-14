import Link from 'next/link';
import { ProductForm } from '../../../../../components/admin/product-form';
import { adminBrands, adminCategories } from '../../../../../lib/admin/categories';

export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  return <><Link href="/admin/produtos" className="text-sm text-slate-500">← Produtos</Link><h1 className="mb-8 mt-2 text-3xl font-bold">Novo produto</h1><ProductForm categories={await adminCategories()} brands={await adminBrands()} /></>;
}
