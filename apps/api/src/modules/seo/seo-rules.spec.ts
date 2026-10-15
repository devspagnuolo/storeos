import { parseMarketingConfig, productIssues, readMarketingConfig } from './seo-rules';

describe('rastreamento', () => {
  it('aceita IDs no formato certo, padroniza e remove campos vazios', () => {
    expect(parseMarketingConfig({ ga4: ' g-abc123def4 ', gtm: 'gtm-abc1234', metaPixel: '123456789012345', googleVerification: '', homeTitle: ' Vivi Moda ', homeDescription: '' })).toEqual({ ga4: 'G-ABC123DEF4', gtm: 'GTM-ABC1234', metaPixel: '123456789012345', homeTitle: 'Vivi Moda' });
  });
  it('recusa script, tag inteira e IDs errados', () => {
    expect(() => parseMarketingConfig({ ga4: '<script>alert(1)</script>' })).toThrow('Google Analytics');
    expect(() => parseMarketingConfig({ gtm: 'G-ABC123' })).toThrow('Tag Manager');
    expect(() => parseMarketingConfig({ metaPixel: 'abc' })).toThrow('pixel');
    expect(() => parseMarketingConfig({ googleVerification: '<meta name="google-site-verification" content="x">' })).toThrow('verificação');
    expect(() => parseMarketingConfig({ homeTitle: 'x'.repeat(71) })).toThrow('70');
  });
  it('lê JSON salvo sem quebrar quando está inválido', () => {
    expect(readMarketingConfig({ ga4: 'lixo' })).toEqual({});
    expect(readMarketingConfig(null)).toEqual({});
  });
});

describe('auditoria de produto', () => {
  const ok = { seoTitle: 'Vestido midi', seoDescription: 'Vestido midi em viscose com elastano', description: 'x'.repeat(120), images: [{ alt: 'Vestido' }] };
  it('produto completo não tem pendência', () => { expect(productIssues(ok)).toEqual([]); });
  it('aponta foto, descrição e texto para o Google', () => {
    expect(productIssues({ ...ok, images: [] })).toEqual(['no-photo']);
    expect(productIssues({ ...ok, images: [{ alt: ' ' }] })).toEqual(['no-alt']);
    expect(productIssues({ seoTitle: null, seoDescription: null, description: null, images: [{ alt: 'a' }] })).toEqual(['no-description', 'no-seo-title', 'no-seo-description']);
    expect(productIssues({ ...ok, description: 'curta' })).toEqual(['short-description']);
  });
  it('descrição longa já serve de texto para o Google', () => {
    expect(productIssues({ ...ok, seoDescription: null })).toEqual([]);
  });
});
