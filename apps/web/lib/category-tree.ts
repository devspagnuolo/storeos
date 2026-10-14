export const MAX_CATEGORY_DEPTH = 4;

type Node = { id: string; parentId: string | null };
export type TreeNode<T extends Node> = T & { depth: number; children: TreeNode<T>[] };

/** Árvore completa (Categoria > Sub > Sub > Sub), na ordem em que a API devolve. */
export function buildTree<T extends Node>(items: T[]): TreeNode<T>[] {
  const known = new Set(items.map(i => i.id));
  const grow = (parentId: string | null, depth: number): TreeNode<T>[] =>
    depth > MAX_CATEGORY_DEPTH ? [] : items.filter(i => (i.parentId && known.has(i.parentId) ? i.parentId : null) === parentId).map(i => ({ ...i, depth, children: grow(i.id, depth + 1) }));
  return grow(null, 1);
}

export function flatten<T extends Node>(tree: TreeNode<T>[]): TreeNode<T>[] {
  return tree.flatMap(node => [node, ...flatten(node.children)]);
}

const levels = <T extends Node>(node: TreeNode<T>): number => 1 + Math.max(0, ...node.children.map(levels));

/** Categorias que podem ser pai de `node`: não ele mesmo nem seus descendentes, e sem estourar os quatro níveis. */
export function parentChoices<T extends Node>(tree: TreeNode<T>[], node?: TreeNode<T>): TreeNode<T>[] {
  const blocked = new Set(node ? flatten([node]).map(n => n.id) : []);
  const own = node ? levels(node) : 1;
  return flatten(tree).filter(candidate => !blocked.has(candidate.id) && candidate.depth + own <= MAX_CATEGORY_DEPTH);
}

/** Do pai até a categoria, para mostrar "Blusas › Manga Longa › Renda". */
export function pathOf<T extends Node & { name: string }>(items: T[], id: string): T[] {
  const byId = new Map(items.map(i => [i.id, i]));
  const path: T[] = [];
  for (let current = byId.get(id); current && path.length < MAX_CATEGORY_DEPTH; current = current.parentId ? byId.get(current.parentId) : undefined) path.unshift(current);
  return path;
}
