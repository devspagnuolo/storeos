import { descendantIds, depthOf, parentProblem, subtreeLevels } from './category-tree';

const tree = [
  { id: 'blusas', parentId: null }, { id: 'longa', parentId: 'blusas' }, { id: 'renda', parentId: 'longa' }, { id: 'fina', parentId: 'renda' },
  { id: 'calcas', parentId: null }, { id: 'jeans', parentId: 'calcas' },
];

describe('árvore de categorias', () => {
  it('calcula nível, altura e descendentes', () => {
    expect([depthOf(tree, 'blusas'), depthOf(tree, 'renda'), depthOf(tree, 'fina')]).toEqual([1, 3, 4]);
    expect([subtreeLevels(tree, 'blusas'), subtreeLevels(tree, 'longa'), subtreeLevels(tree, 'fina'), subtreeLevels(tree, 'calcas')]).toEqual([4, 3, 1, 2]);
    expect(descendantIds(tree, 'longa').sort()).toEqual(['fina', 'longa', 'renda']);
  });
  it('aceita até quatro níveis ao criar', () => {
    expect(parentProblem(tree, 'renda')).toBeUndefined();
    expect(parentProblem(tree, 'fina')).toContain('4 níveis');
    expect(parentProblem(tree, 'nada')).toBe('Categoria pai inválida');
  });
  it('ao mover, conta a árvore que vai junto e recusa ciclos', () => {
    expect(parentProblem(tree, 'jeans', 'fina')).toBeUndefined();
    expect(parentProblem(tree, 'jeans', 'longa')).toContain('4 níveis'); // longa carrega 3 níveis: 2 + 3 > 4
    expect(parentProblem(tree, 'calcas', 'longa')).toBeUndefined();
    expect(parentProblem(tree, 'renda', 'longa')).toContain('dentro dela mesma');
    expect(parentProblem(tree, 'blusas', 'blusas')).toContain('dentro dela mesma');
  });
});
