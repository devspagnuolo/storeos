import { describe, expect, it } from 'vitest';
import { defaultHomeSections, duplicateSection, effectiveSections, moveItem, newSection } from './storefront-model';
import { contrastRatio, themeStyle } from './theme';

describe('modelo da vitrine', () => {
  it('usa o layout padrão com banners ou destaque e respeita a configuração do lojista', () => {
    expect(defaultHomeSections({}, true).map(s => s.type)).toEqual(['banners', 'products', 'benefits']);
    expect(defaultHomeSections({ heroTitle: 'Oi' }, false)[0]).toMatchObject({ type: 'hero', props: { title: 'Oi' } });
    const custom = [newSection('text')];
    expect(effectiveSections({ home: { sections: custom } }, true)).toBe(custom);
  });
  it('reordena e duplica sem mutar a lista original', () => {
    const list = [newSection('text'), newSection('video'), newSection('image')];
    expect(moveItem(list, 0, 2).map(s => s.type)).toEqual(['video', 'image', 'text']);
    expect(moveItem(list, 0, 9)).toBe(list);
    const dup = duplicateSection(list, list[1].id);
    expect(dup).toHaveLength(4);
    expect(dup[2].type).toBe('video');
    expect(dup[2].id).not.toBe(list[1].id);
    expect(list).toHaveLength(3);
  });
});

describe('tema', () => {
  it('gera variáveis a partir do preset e das escolhas', () => {
    const style = themeStyle({ accentColor: '#FFFF00', design: { preset: 'minimalista', buttonRadius: 'full' } });
    expect(style['--btn-radius']).toBe('9999px');
    expect(style['--container']).toBe('64rem');
    expect(style['--brand']).toBe('255 255 0');
    expect(style['--brand-fg']).toBe('17 24 39');
  });
  it('calcula contraste', () => { expect(contrastRatio('#000000', '#FFFFFF')).toBeGreaterThan(20); });
});

import { diffConfigs } from './storefront-diff';
describe('comparação de versões', () => {
  it('descreve seções, ordem, visual e aviso', () => {
    const a = newSection('text'), b = newSection('video');
    const before = { home: { sections: [a, b] }, accentColor: '#112233' };
    const after = { home: { sections: [b, { ...a, props: { ...a.props, heading: 'Outro' } }, newSection('image')] }, accentColor: '#445566', design: { font: 'serif' }, announcementText: 'Oi' };
    const lines = diffConfigs(before, after);
    expect(lines).toEqual(expect.arrayContaining(['Seção adicionada: Imagem', 'Texto: conteúdo alterado', 'Ordem das seções alterada', 'Tipografia alterado', 'Cor de destaque alterada', 'Faixa de aviso alterada']));
    expect(diffConfigs(before, before)).toEqual([]);
  });
});
