import { adjustTarget, defaultQuantity, planTransfer, slugCode } from './warehouse-rules';

describe('warehouse-rules', () => {
  it('o padrão guarda o restante', () => {
    expect(defaultQuantity(10, [3, 2])).toBe(5);
    expect(defaultQuantity(10, [])).toBe(10);
  });
  it('gera código sem acento', () => {
    expect(slugCode('Loja São João')).toBe('loja-sao-joao');
  });
  it('planeja transferência sem mudar o total', () => {
    const h = [{ id: 'a', isDefault: true, quantity: 8 }, { id: 'b', isDefault: false, quantity: 1 }];
    expect(planTransfer(h, 'a', 'b', 3)).toEqual({ fromQuantity: 5, toQuantity: 4 });
  });
  it('recusa transferências inválidas', () => {
    const h = [{ id: 'a', isDefault: true, quantity: 2 }, { id: 'b', isDefault: false, quantity: 0 }];
    expect(() => planTransfer(h, 'a', 'b', 3)).toThrow('Só há 2');
    expect(() => planTransfer(h, 'a', 'a', 1)).toThrow('diferentes');
    expect(() => planTransfer(h, 'a', 'b', 0)).toThrow();
    expect(() => planTransfer(h, 'a', 'x', 1)).toThrow('não encontrado');
  });
  it('calcula ajuste', () => {
    expect(adjustTarget(5, 'DELTA', -2)).toBe(3);
    expect(adjustTarget(5, 'SET', 9)).toBe(9);
  });
});
