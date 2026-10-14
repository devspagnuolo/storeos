import Link from 'next/link';
import type { Category } from '../lib/api';

export function CategoryNav({ categories, active }: { categories: Category[]; active?: string }) {
  const item = (href: string, label: string, selected: boolean) => <Link key={href} href={href} className={`rounded-full border px-4 py-1.5 text-sm font-medium ${selected ? 'border-brand bg-brand text-white' : 'border-slate-200 bg-white hover:border-brand'}`}>{label}</Link>;
  return <div className="flex flex-wrap gap-2">{item('/categorias', 'Todos', !active)}{categories.map(c => item(`/categorias/${c.slug}`, c.name, c.slug === active))}</div>;
}
