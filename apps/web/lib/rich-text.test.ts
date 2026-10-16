import { describe, expect, it } from 'vitest';
import { parseInline, parseRichText, safeHref } from './rich-text';

const t = (text: string, extra: object = {}) => ({ type: 'text', text, ...extra });

describe('parseRichText', () => {
  it('separa títulos, listas, parágrafos com quebra de linha e destaques', () => {
    const blocks = parseRichText('## Trocas\n\nAceitamos trocas em 7 dias.\nSem custo.\n\n- Produto sem uso\n- Embalagem original\n\n### Prazo\n1. Peça\n2. Envie\n> Importante\n---\n![Loja](https://cdn.test/a.jpg)');
    expect(blocks).toEqual([
      { type: 'h2', text: [t('Trocas')] },
      { type: 'p', lines: [[t('Aceitamos trocas em 7 dias.')], [t('Sem custo.')]] },
      { type: 'ul', items: [[t('Produto sem uso')], [t('Embalagem original')]] },
      { type: 'h3', text: [t('Prazo')] },
      { type: 'ol', items: [[t('Peça')], [t('Envie')]] },
      { type: 'quote', lines: [[t('Importante')]] },
      { type: 'hr' },
      { type: 'image', src: 'https://cdn.test/a.jpg', alt: 'Loja' },
    ]);
  });

  it('entende negrito, itálico e links seguros', () => {
    expect(parseInline('Fale **agora** pelo *[WhatsApp](https://wa.me/5511)*')).toEqual([
      t('Fale '), t('agora', { bold: true }), t(' pelo '),
      { type: 'link', href: 'https://wa.me/5511', children: [t('WhatsApp', { italic: true })] },
    ]);
    expect(parseInline('[clique](javascript:alert(1))')).toEqual([t('[clique](javascript:alert(1)'), t(')')]);
    expect(safeHref('/p/trocas')).toBe('/p/trocas');
    expect(safeHref('//evil.test')).toBeNull();
    expect(safeHref('data:text/html,x')).toBeNull();
  });

  it('mantém HTML como texto puro (o React escapa na renderização)', () => {
    expect(parseRichText('<script>alert(1)</script>')).toEqual([{ type: 'p', lines: [[t('<script>alert(1)</script>')]] }]);
  });

  it('imagem só com endereço https', () => {
    expect(parseRichText('![x](http://a.test/b.jpg)')[0].type).toBe('p');
  });
});
