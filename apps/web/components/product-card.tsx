import Link from 'next/link';
import type { ProductSummary } from '../lib/api';
import { formatPrice } from '../lib/format';
export function ProductCard({ product }: { product: ProductSummary }) { return <Link href={`/produto/${product.slug}`} className="card group overflow-hidden"><div className="aspect-square bg-gradient-to-br from-slate-100 to-violet-100">{product.images?.[0] && <img src={product.images[0].url} alt={product.images[0].alt || product.name} className="h-full w-full object-cover" loading="lazy" />}</div><div className="p-4"><p className="font-semibold group-hover:text-brand">{product.name}</p><p className="mt-2 text-lg font-bold">{formatPrice(product.price)}</p></div></Link>; }
