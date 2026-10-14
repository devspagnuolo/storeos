/** Regras da árvore de categorias (Categoria > Sub > Sub > Sub). Puro, sem banco. */
export const MAX_CATEGORY_DEPTH = 4;

export type CategoryNode = { id: string; parentId: string | null };

const childrenOf = (nodes: CategoryNode[], id: string) => nodes.filter(n => n.parentId === id);

/** Nível de uma categoria: 1 para as principais. Ciclos nunca acontecem, mas o limite protege de dados ruins. */
export function depthOf(nodes: CategoryNode[], id: string): number {
  let depth = 1;
  let current = nodes.find(n => n.id === id);
  while (current?.parentId && depth <= MAX_CATEGORY_DEPTH * 2) {
    depth++;
    current = nodes.find(n => n.id === current!.parentId);
  }
  return depth;
}

/** Quantos níveis a árvore abaixo de `id` ocupa, contando a própria categoria. */
export function subtreeLevels(nodes: CategoryNode[], id: string, guard = 0): number {
  if (guard > MAX_CATEGORY_DEPTH * 2) return 1;
  return 1 + Math.max(0, ...childrenOf(nodes, id).map(child => subtreeLevels(nodes, child.id, guard + 1)));
}

/** A própria categoria e todas as descendentes (usado no filtro da vitrine). */
export function descendantIds(nodes: CategoryNode[], id: string): string[] {
  const result = [id];
  for (let i = 0; i < result.length && result.length <= nodes.length; i++) result.push(...childrenOf(nodes, result[i]).map(c => c.id));
  return result;
}

/** Devolve a mensagem de erro se `parentId` não pode ser pai de `selfId` (ou de uma categoria nova, sem `selfId`). */
export function parentProblem(nodes: CategoryNode[], parentId: string, selfId?: string): string | undefined {
  if (!nodes.some(n => n.id === parentId)) return 'Categoria pai inválida';
  if (selfId && descendantIds(nodes, selfId).includes(parentId)) return 'Uma categoria não pode ficar dentro dela mesma nem de suas subcategorias';
  const levels = depthOf(nodes, parentId) + (selfId ? subtreeLevels(nodes, selfId) : 1);
  if (levels > MAX_CATEGORY_DEPTH) return `A árvore aceita até ${MAX_CATEGORY_DEPTH} níveis (Categoria > Subcategoria > Subcategoria > Subcategoria)`;
  return undefined;
}
