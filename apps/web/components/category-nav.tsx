import Link from 'next/link';
import type { Category } from '../lib/api';
import { buildTree, flatten, TreeNode } from '../lib/category-tree';

/** Uma fileira por nível: as principais e, abaixo, as filhas de cada categoria do caminho aberto. */
export function CategoryNav({ categories, active }: { categories: Category[]; active?: string }) {
  const tree = buildTree(categories);
  const all = flatten(tree);
  const current = all.find(c => c.slug === active);
  const path: TreeNode<Category>[] = [];
  for (let node = current; node; node = node.parentId ? all.find(c => c.id === node!.parentId) : undefined) path.unshift(node);
  const item = (href: string, label: string, selected: boolean) => <Link key={href} href={href} className={`rounded-full border px-4 py-1.5 text-sm font-medium ${selected ? 'border-brand bg-brand text-white' : 'border-slate-200 bg-white hover:border-brand'}`}>{label}</Link>;
  const rows: { key: string; items: TreeNode<Category>[] }[] = [{ key: 'root', items: tree }];
  for (const node of path) if (node.children.length) rows.push({ key: node.id, items: node.children });
  return (
    <div className="grid gap-3">
      {rows.map((row, index) => (
        <div key={row.key} className={`flex flex-wrap gap-2 ${index ? 'text-sm' : ''}`}>
          {index === 0 && item('/categorias', 'Todos', !active)}
          {row.items.map(c => item(`/categorias/${c.slug}`, c.name, path.some(p => p.id === c.id)))}
        </div>))}
    </div>
  );
}
