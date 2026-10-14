import Link from 'next/link';
import type { Category } from '../lib/api';

export function CategoryNav({ categories, active }: { categories: Category[]; active?: string }) {
  const item = (href: string, label: string, selected: boolean) => <Link key={href} href={href} className={`rounded-full border px-4 py-1.5 text-sm font-medium ${selected ? 'border-brand bg-brand text-white' : 'border-slate-200 bg-white hover:border-brand'}`}>{label}</Link>;
  const roots = categories.filter(c => !c.parentId);
  // As subcategorias aparecem quando a categoria principal (ou uma de suas filhas) está aberta.
  const current = categories.find(c => c.slug === active);
  const openRoot = current?.parentId ?? current?.id;
  const children = categories.filter(c => c.parentId && c.parentId === openRoot);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">{item('/categorias', 'Todos', !active)}{roots.map(c => item(`/categorias/${c.slug}`, c.name, c.slug === active))}</div>
      {children.length > 0 && <div className="flex flex-wrap gap-2 text-sm">{children.map(c => item(`/categorias/${c.slug}`, c.name, c.slug === active))}</div>}
    </div>
  );
}
