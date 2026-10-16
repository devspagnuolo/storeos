import { Prisma } from '@prisma/client';

/** Filtros da vitrine: atributo das variações (Tamanho, Cor…) e faixa de preço. */
export type AttributeFilter = { name: string; values: string[] };

const MAX_GROUPS = 6;
const MAX_VALUES = 30;

/** `Tamanho:G||Tamanho:GG||Cor:Preto` → [{ Tamanho: [G, GG] }, { Cor: [Preto] }]. Ignora o que não tem nome e valor. */
export function parseAttributeFilters(raw?: string): AttributeFilter[] {
  const groups = new Map<string, Set<string>>();
  for (const part of (raw ?? '').split('||')) {
    const at = part.indexOf(':');
    if (at < 1) continue;
    const name = part.slice(0, at).trim().slice(0, 60);
    const value = part.slice(at + 1).trim().slice(0, 60);
    if (!name || !value) continue;
    if (!groups.has(name) && groups.size >= MAX_GROUPS) continue;
    const values = groups.get(name) ?? new Set<string>();
    if (values.size < MAX_VALUES) values.add(value);
    groups.set(name, values);
  }
  return [...groups].map(([name, values]) => ({ name, values: [...values] }));
}

/** A mesma variação precisa atender a todos os atributos (tamanho G na cor preta), estar ativa e ter estoque. */
export function attributeWhere(filters: AttributeFilter[]): Prisma.ProductWhereInput | undefined {
  if (!filters.length) return undefined;
  return { variants: { some: {
    active: true,
    inventory: { some: { quantity: { gt: 0 } } },
    AND: filters.map(filter => ({ OR: filter.values.map(value => ({ attributes: { array_contains: [{ name: filter.name, value }] } })) })),
  } } };
}

/** Preço do produto ou de alguma variação ativa dentro da faixa. */
export function priceWhere(min?: number, max?: number): Prisma.ProductWhereInput | undefined {
  if (min === undefined && max === undefined) return undefined;
  const range = { ...(min !== undefined && { gte: min }), ...(max !== undefined && { lte: max }) };
  return { OR: [{ price: range }, { variants: { some: { active: true, price: range } } }] };
}

const SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'EG', 'EGG', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6'];
/** Tamanhos na ordem da loja (PP…G6), números em ordem crescente, o resto em ordem alfabética. */
export function sortValues(values: string[]) {
  const rank = (value: string) => {
    const size = SIZES.indexOf(value.toUpperCase());
    if (size >= 0) return [0, size] as const;
    const number = Number(value.replace(',', '.'));
    return Number.isFinite(number) ? [1, number] as const : [2, 0] as const;
  };
  return [...values].sort((a, b) => {
    const [ga, ra] = rank(a);
    const [gb, rb] = rank(b);
    return ga - gb || ra - rb || a.localeCompare(b, 'pt-BR');
  });
}

type FacetSource = { price: Prisma.Decimal | number | string; variants: { attributes: Prisma.JsonValue; price: Prisma.Decimal | number | string | null }[] };

/** Opções de filtro a partir dos produtos da lista: atributos das variações ativas e a faixa de preço. */
export function buildFacets(products: FacetSource[]) {
  const attributes = new Map<string, Map<string, string>>();
  const prices: number[] = [];
  for (const product of products) {
    prices.push(Number(product.price));
    for (const variant of product.variants) {
      if (variant.price !== null) prices.push(Number(variant.price));
      if (!Array.isArray(variant.attributes)) continue;
      for (const attribute of variant.attributes as { name?: unknown; value?: unknown }[]) {
        if (typeof attribute?.name !== 'string' || typeof attribute.value !== 'string' || !attribute.name.trim() || !attribute.value.trim()) continue;
        const name = attribute.name.trim();
        const values = attributes.get(name) ?? new Map<string, string>();
        // Mesma opção escrita de jeitos diferentes ("preto" e "Preto") aparece uma vez só.
        if (!values.has(attribute.value.trim().toLowerCase())) values.set(attribute.value.trim().toLowerCase(), attribute.value.trim());
        attributes.set(name, values);
      }
    }
  }
  const valid = prices.filter(Number.isFinite);
  return {
    attributes: [...attributes].map(([name, values]) => ({ name, values: sortValues([...values.values()]) })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    price: valid.length ? { min: Math.floor(Math.min(...valid)), max: Math.ceil(Math.max(...valid)) } : null,
  };
}
