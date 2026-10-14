import { CategoryForm } from '../../../../components/admin/category-form';
import { adminCategories } from '../../../../lib/admin/categories';
import type { Category } from '../../../../lib/api';
import { buildTree, parentChoices, TreeNode } from '../../../../lib/category-tree';
import { deleteCategoryAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  const categories = await adminCategories();
  const tree = buildTree(categories);
  const choices = (node?: TreeNode<Category>) => parentChoices(tree, node).map(({ id, name, depth }) => ({ id, name, depth }));
  const render = (node: TreeNode<Category>): React.ReactNode => (
    <div key={node.id} className={node.depth > 1 ? 'ml-6 border-l pl-4' : ''}>
      <div className={node.depth === 1 ? 'card p-5' : 'mt-3'}>
        {node.depth === 1 && <p className="mb-3 font-bold">{node.name} <span className="ml-2 text-xs font-normal text-slate-500">/categorias/{node.slug}</span></p>}
        <CategoryForm category={node} parents={choices(node)} />
        <form action={deleteCategoryAction} className="mt-1"><input type="hidden" name="id" value={node.id} /><button className="text-xs text-red-700 underline">Excluir {node.name}{node.children.length ? ' (as subcategorias sobem um nível)' : ''}</button></form>
        {node.children.map(render)}
      </div>
    </div>
  );
  return (
    <>
      <h1 className="text-3xl font-bold">Categorias</h1>
      <p className="mt-1 text-sm text-slate-500">Organize a vitrine em até quatro níveis, por exemplo Blusas › Manga Longa › Renda. Ao abrir uma categoria, a loja mostra também os produtos de tudo que está dentro dela, e o menu do topo é montado a partir desta árvore.</p>
      <section className="card mt-6 p-6"><CategoryForm parents={choices()} /></section>
      <div className="mt-6 space-y-4">
        {tree.map(render)}
        {!tree.length && <p className="card p-8 text-center text-slate-500">Nenhuma categoria ainda.</p>}
      </div>
    </>
  );
}
