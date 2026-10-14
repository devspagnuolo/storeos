import type { Category } from '../lib/api';

/** Banner fixo no topo da página da categoria; no celular usa a versão vertical, se houver. */
export function CategoryBanner({ category }: { category: Category }) {
  if (!category.bannerUrl) return null;
  return (
    <div className="w-full bg-slate-100">
      <picture>
        {category.bannerMobileUrl && <source media="(max-width: 640px)" srcSet={category.bannerMobileUrl} />}
        <img src={category.bannerUrl} alt={category.name} className="mx-auto max-h-[420px] w-full object-cover" />
      </picture>
    </div>
  );
}
