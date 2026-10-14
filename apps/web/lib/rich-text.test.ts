import { describe, expect, it } from 'vitest';
import { parseRichText } from './rich-text';

describe('parseRichText', () => {
  it('separa títulos, listas e parágrafos', () => {
    const blocks = parseRichText('## Trocas\n\nAceitamos trocas em 7 dias.\nSem custo.\n\n- Produto sem uso\n- Embalagem original\n\n### Prazo\n\nAté 30 dias.');
    expect(blocks).toEqual([
      { type: 'h2', text: 'Trocas' },
      { type: 'p', text: 'Aceitamos trocas em 7 dias. Sem custo.' },
      { type: 'ul', items: ['Produto sem uso', 'Embalagem original'] },
      { type: 'h3', text: 'Prazo' },
      { type: 'p', text: 'Até 30 dias.' },
    ]);
  });
  it('mantém HTML como texto puro (o React escapa na renderização)', () => {
    expect(parseRichText('<script>alert(1)</script>')).toEqual([{ type: 'p', text: '<script>alert(1)</script>' }]);
  });
});
