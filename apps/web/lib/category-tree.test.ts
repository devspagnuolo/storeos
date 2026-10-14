import { describe, expect, it } from 'vitest';
import { buildTree, flatten, parentChoices, pathOf } from './category-tree';

const items = [
  { id: 'b', name: 'Blusas', parentId: null }, { id: 'l', name: 'Manga Longa', parentId: 'b' }, { id: 'r', name: 'Renda', parentId: 'l' },
  { id: 'c', name: 'Calças', parentId: null }, { id: 'j', name: 'Jeans', parentId: 'c' },
];

describe('category-tree', () => {
  const tree = buildTree(items);
  it('monta a árvore com níveis', () => {
    expect(flatten(tree).map(n => [n.id, n.depth])).toEqual([['b', 1], ['l', 2], ['r', 3], ['c', 1], ['j', 2]]);
  });
  it('lista os pais possíveis sem ciclos e respeitando quatro níveis', () => {
    const blusas = flatten(tree).find(n => n.id === 'b')!;
    expect(parentChoices(tree, blusas).map(n => n.id)).toEqual(['c']); // Blusas leva 3 níveis: só cabe dentro de uma principal (1 + 3 = 4); em Jeans seriam 5
  });
  it('categoria nova pode ficar em qualquer nível até o terceiro', () => {
    expect(parentChoices(tree).map(n => n.id)).toEqual(['b', 'l', 'r', 'c', 'j']);
  });
  it('monta o caminho', () => {
    expect(pathOf(items, 'r').map(i => i.name)).toEqual(['Blusas', 'Manga Longa', 'Renda']);
  });
});
