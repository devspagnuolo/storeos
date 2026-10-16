import { attributeWhere, buildFacets, parseAttributeFilters, priceWhere, sortValues } from './product-filters';

describe('filtros da vitrine', () => {
  it('agrupa os valores por atributo e ignora o que vem quebrado', () => {
    expect(parseAttributeFilters('Tamanho:G||Tamanho:GG||Cor:Preto||semvalor||:x||Cor:')).toEqual([{ name: 'Tamanho', values: ['G', 'GG'] }, { name: 'Cor', values: ['Preto'] }]);
    expect(parseAttributeFilters(undefined)).toEqual([]);
    expect(parseAttributeFilters('Medida:10:20')).toEqual([{ name: 'Medida', values: ['10:20'] }]);
  });

  it('a mesma variação precisa ter o tamanho e a cor escolhidos, ativa e com estoque', () => {
    expect(attributeWhere([])).toBeUndefined();
    expect(attributeWhere([{ name: 'Tamanho', values: ['G', 'GG'] }, { name: 'Cor', values: ['Preto'] }])).toEqual({ variants: { some: {
      active: true,
      inventory: { some: { quantity: { gt: 0 } } },
      AND: [
        { OR: [{ attributes: { array_contains: [{ name: 'Tamanho', value: 'G' }] } }, { attributes: { array_contains: [{ name: 'Tamanho', value: 'GG' }] } }] },
        { OR: [{ attributes: { array_contains: [{ name: 'Cor', value: 'Preto' }] } }] },
      ],
    } } });
  });

  it('faixa de preço vale para o produto ou para uma variação', () => {
    expect(priceWhere()).toBeUndefined();
    expect(priceWhere(50)).toEqual({ OR: [{ price: { gte: 50 } }, { variants: { some: { active: true, price: { gte: 50 } } } }] });
  });

  it('ordena tamanhos como na loja, depois números e texto', () => {
    expect(sortValues(['GG', 'Azul', 'P', '44', 'G1', '40', 'M'])).toEqual(['P', 'M', 'GG', 'G1', '40', '44', 'Azul']);
  });

  it('monta as opções a partir das variações e a faixa de preço', () => {
    const facets = buildFacets([
      { price: '99.90', variants: [{ attributes: [{ name: 'Tamanho', value: 'GG' }, { name: 'Cor', value: 'Preto' }], price: null }, { attributes: [{ name: 'Tamanho', value: 'G' }, { name: 'Cor', value: 'preto' }], price: '120.00' }] },
      { price: '49.50', variants: [] },
    ]);
    expect(facets).toEqual({ attributes: [{ name: 'Cor', values: ['Preto'] }, { name: 'Tamanho', values: ['G', 'GG'] }], price: { min: 49, max: 120 } });
    expect(buildFacets([]).price).toBeNull();
  });
});
