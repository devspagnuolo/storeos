import { planStockSync, reconcile, SiteItem } from './bling-reconcile';

const site = (sku: string, over: Partial<SiteItem> = {}): SiteItem => ({ sku, name: sku, price: 10, stock: 5, reserved: 0, active: true, productId: 'p-' + sku, variantId: null, ...over });
const bling = (sku: string, over = {}) => ({ sku, name: sku, price: 10, stock: 5, active: true, ...over });

describe('conferência com o Bling', () => {
  it('encontra o que existe só de um lado e as divergências, ignorando maiúsculas no SKU', () => {
    const result = reconcile(
      [bling('A-1'), bling('B-2', { stock: 9 }), bling('C-3', { price: 12.5 }), bling('NOVO'), bling('INATIVO', { active: false })],
      [site('a-1'), site('b-2'), site('c-3'), site('SO-SITE'), site('RASCUNHO', { active: false })],
    );
    expect(result.onlyInBling.map(i => i.sku)).toEqual(['NOVO']);
    expect(result.onlyOnSite.map(i => i.sku)).toEqual(['SO-SITE']);
    expect(result.stock).toEqual([expect.objectContaining({ sku: 'b-2', bling: 9, site: 5 })]);
    expect(result.price).toEqual([{ sku: 'c-3', name: 'c-3', bling: 12.5, site: 10 }]);
    expect(result.summary).toEqual({ bling: 5, site: 5, matched: 3, inSync: 1 });
  });
  it('não acusa diferença de preço por arredondamento de centavos', () => {
    expect(reconcile([bling('A', { price: 10.001 })], [site('A')]).price).toEqual([]);
  });
});

describe('plano de sincronização de estoque', () => {
  const diffs = reconcile([bling('A', { stock: 20 }), bling('B', { stock: 1 }), bling('C', { stock: 0 }), bling('D', { stock: 7 })], [
    site('A'), site('B', { stock: 8, reserved: 3 }), site('C', { stock: 2, reserved: 2 }), site('D'),
  ]).stock;
  it('copia o saldo do Bling, respeitando o reservado e pedidos ainda não enviados', () => {
    const plan = planStockSync(diffs, new Set(['d']));
    expect(plan.apply).toEqual([
      expect.objectContaining({ sku: 'A', from: 5, to: 20 }),
      expect.objectContaining({ sku: 'B', from: 8, to: 3 }), // 1 no Bling, mas 3 reservados
    ]);
    expect(plan.skipped.map(s => s.sku)).toEqual(['C', 'D']);
  });
});
