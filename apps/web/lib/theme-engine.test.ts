import { describe, expect, it } from 'vitest';
import type { ThemeDocument } from '@storeos/contracts';
import { engineNumber, engineSection, engineStyle } from './theme-engine';

const doc = (tokens: ThemeDocument['global']['designTokens']): ThemeDocument => ({
  schemaVersion: 1, themeRelease: 'x@1.0.0', global: { designTokens: tokens, settings: {} },
  templates: { product: { sections: [{ id: 'a', type: 'storeos.product-detail.v1', enabled: false, settings: { showSku: false }, blocks: [] }, { id: 'b', type: 'storeos.product-detail.v1', enabled: true, settings: { showSku: true }, blocks: [] }] } },
} as ThemeDocument);

describe('engineStyle', () => {
  it('converte tokens válidos nas variáveis da vitrine', () => {
    const style = engineStyle(doc({ colors: { primary: '#6D28D9', background: '#FFFFFF', text: '#0F172A' }, shape: { buttonRadius: '12px' }, typography: { fontFamily: 'serif' } }));
    expect(style['--brand']).toBe('109 40 217');
    expect(style['--btn-radius']).toBe('12px');
    expect(style.fontFamily).toContain('Georgia');
    expect(style.backgroundColor).toBe('#FFFFFF');
  });
  it('ignora valores que poderiam injetar CSS', () => {
    const style = engineStyle(doc({ colors: { primary: 'red;background:url(x)', text: 'expression(1)' }, shape: { buttonRadius: '1px;color:red' }, typography: { fontFamily: 'Comic; x' } }));
    expect(style).toEqual({});
  });
});

describe('engineSection', () => {
  it('usa a primeira seção visível do tipo', () => {
    expect(engineSection(doc({}), 'product', 'storeos.product-detail.v1')).toEqual({ showSku: true });
    expect(engineSection(doc({}), 'category', 'storeos.product-collection.v1')).toBeNull();
    expect(engineSection(null, 'product', 'storeos.product-detail.v1')).toBeNull();
  });
  it('limita números', () => {
    expect(engineNumber(100, 4, 48)).toBe(48);
    expect(engineNumber('8', 4, 48)).toBeUndefined();
  });
});
