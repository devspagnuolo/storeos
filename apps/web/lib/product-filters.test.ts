import { describe, expect, it } from 'vitest';
import { apiFilters, filterCount, readFilters, urlFilters } from './product-filters';

describe('filtros da vitrine', () => {
  it('lê tamanho, cor e faixa de preço da URL', () => {
    const filters = readFilters({ filtro: ['Tamanho:G', 'Cor:Preto', 'quebrado', ':x'], min: '200', max: '50,5' });
    expect(filters).toEqual({ selected: [{ name: 'Tamanho', value: 'G' }, { name: 'Cor', value: 'Preto' }], min: 50.5, max: 200 });
    expect(apiFilters(filters)).toEqual({ attrs: 'Tamanho:G||Cor:Preto', minPrice: 50.5, maxPrice: 200 });
    expect(urlFilters(filters)).toEqual({ filtro: ['Tamanho:G', 'Cor:Preto'], min: '50.5', max: '200' });
    expect(filterCount(filters)).toBe(3);
  });
  it('sem filtros não manda nada', () => {
    const filters = readFilters({ filtro: 'Cor:Azul', min: 'abc' });
    expect(apiFilters(filters)).toEqual({ attrs: 'Cor:Azul' });
    expect(apiFilters(readFilters({}))).toEqual({});
  });
});
