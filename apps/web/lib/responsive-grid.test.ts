import { describe, expect, it } from 'vitest';
import { gridColumns, visibilityClass } from './responsive-grid';

describe('colunas por tamanho de tela', () => {
  it('usa o padrão quando o tema não define', () => {
    expect(gridColumns(undefined, undefined, { mobile: 2, desktop: 4 })).toBe('grid-cols-2 md:grid-cols-3 lg:grid-cols-4');
  });
  it('aplica celular e computador e calcula o tablet', () => {
    expect(gridColumns(1, 3, { mobile: 2, desktop: 4 })).toBe('grid-cols-1 md:grid-cols-3 lg:grid-cols-3');
    expect(gridColumns(3, 6, { mobile: 2, desktop: 4 })).toBe('grid-cols-3 md:grid-cols-4 lg:grid-cols-6');
  });
  it('ignora valores fora do permitido', () => {
    expect(gridColumns(9, 9, { mobile: 2, desktop: 4 })).toBe('grid-cols-2 md:grid-cols-4 lg:grid-cols-4');
  });
  it('mostra só no computador ou só no celular', () => {
    expect(visibilityClass('desktop')).toBe('hidden md:block');
    expect(visibilityClass('mobile')).toBe('md:hidden');
    expect(visibilityClass('all')).toBe('');
  });
});
