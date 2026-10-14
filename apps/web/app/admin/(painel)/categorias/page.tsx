import { CategoryForm } from '../../../../components/admin/category-form';
import { adminCategories } from '../../../../lib/admin/categories';
import { deleteCategoryAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  const categories = await adminCategories();
  const roots = categories.filter(c => !c.parentId);
  return (
    <>
      <h1 className="text-3xl font-bold">Categorias</h1>
      <p className="mt-1 text-sm text-slate-500">Organize a vitrine em categorias e subcategorias (por exemplo, Camisetas › Polo). Ao abrir uma categoria principal, a loja mostra também os produtos das subcategorias.</p>
      <section className="card mt-6 p-6"><CategoryForm roots={roots} /></section>
      <div className="mt-6 space-y-4">
        {roots.map(root => (
          <details key={root.id} open className="card p-5">
            <summary className="cursor-pointer font-bold">{root.name} <span className="ml-2 text-xs font-normal text-slate-500">/categorias/{root.slug}</span></summary>
            <div className="mt-4 space-y-3">
              <CategoryForm category={root} roots={roots} />
              {categories.filter(c => c.parentId === root.id).map(child => (
                <div key={child.id} className="ml-6 border-l pl-4"><CategoryForm category={child} roots={roots} />
                  <form action={deleteCategoryAction} className="mt-1"><input type="hidden" name="id" value={child.id} /><button className="text-xs text-red-700 underline">Excluir {child.name}</button></form></div>))}
              <form action={deleteCategoryAction}><input type="hidden" name="id" value={root.id} /><button className="text-xs text-red-700 underline">Excluir categoria (as subcategorias sobem para o nível principal)</button></form>
            </div>
          </details>))}
        {!roots.length && <p className="card p-8 text-center text-slate-500">Nenhuma categoria ainda.</p>}
      </div>
    </>
  );
}
