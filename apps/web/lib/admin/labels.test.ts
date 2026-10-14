import { describe, expect, it } from 'vitest';
import { slugify } from './labels';

describe('slugify', () => {
  it('gera URL amigável sem acentos', () => {
    expect(slugify('  Panela de Ferro Fundido 24 cm! ')).toBe('panela-de-ferro-fundido-24-cm');
    expect(slugify('Óculos de sol clássico')).toBe('oculos-de-sol-classico');
  });
});
