/** Filtros da vitrine na URL: `filtro=Tamanho:G` (pode repetir), `min` e `max` em reais. */
export type FilterParams = { filtro?: string | string[]; min?: string; max?: string };
export type ActiveFilters = { selected: { name: string; value: string }[]; min?: number; max?: number };

const money = (value?: string) => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return value && Number.isFinite(parsed) && parsed >= 0 ? Math.min(Math.round(parsed * 100) / 100, 1_000_000) : undefined;
};

export function readFilters(params: FilterParams): ActiveFilters {
  const selected = [params.filtro ?? []].flat().slice(0, 40).flatMap(entry => {
    const at = entry.indexOf(':');
    const name = entry.slice(0, at).trim();
    const value = entry.slice(at + 1).trim();
    return at > 0 && name && value ? [{ name: name.slice(0, 60), value: value.slice(0, 60) }] : [];
  });
  let min = money(params.min);
  let max = money(params.max);
  if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
  return { selected, min, max };
}

/** O que vai para a API: `attrs` e faixa de preço. */
export const apiFilters = (filters: ActiveFilters) => ({
  ...(filters.selected.length && { attrs: filters.selected.map(f => `${f.name}:${f.value}`).join('||') }),
  ...(filters.min !== undefined && { minPrice: filters.min }),
  ...(filters.max !== undefined && { maxPrice: filters.max }),
});

/** Os mesmos filtros como parâmetros de URL, para a paginação e os links de remover. */
export const urlFilters = (filters: ActiveFilters): Record<string, string | string[]> => ({
  ...(filters.selected.length && { filtro: filters.selected.map(f => `${f.name}:${f.value}`) }),
  ...(filters.min !== undefined && { min: String(filters.min) }),
  ...(filters.max !== undefined && { max: String(filters.max) }),
});

export const filterCount = (filters: ActiveFilters) => filters.selected.length + (filters.min !== undefined || filters.max !== undefined ? 1 : 0);
