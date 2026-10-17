import { DEFAULT_FOOTER, readFooterConfig, safeHref, socialUrl } from './footer-config';

describe('footer config', () => {
  it('uses the defaults when nothing is saved', () => {
    expect(readFooterConfig(null)).toEqual(DEFAULT_FOOTER);
    expect(readFooterConfig('lixo')).toEqual(DEFAULT_FOOTER);
  });

  it('keeps only safe links', () => {
    expect(safeHref('/p/trocas')).toBe('/p/trocas');
    expect(safeHref('https://loja.com.br/faq')).toBe('https://loja.com.br/faq');
    expect(safeHref('mailto:contato@loja.com.br')).toBe('mailto:contato@loja.com.br');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('//evil.com')).toBeNull();
    expect(safeHref('/\\evil.com')).toBeNull();
  });

  it('turns handles into profile urls and rejects junk', () => {
    expect(socialUrl('instagram', '@vivimoda')).toBe('https://instagram.com/vivimoda');
    expect(socialUrl('tiktok', '@vivi.moda')).toBe('https://www.tiktok.com/@vivi.moda');
    expect(socialUrl('facebook', 'facebook.com/vivi')).toBe('https://facebook.com/vivi');
    expect(socialUrl('facebook', 'http://facebook.com/vivi')).toBe('https://facebook.com/vivi');
    expect(socialUrl('youtube', 'javascript:alert(1)')).toBe('');
  });

  it('cleans each section and drops invalid links', () => {
    const config = readFooterConfig({
      departments: { enabled: false, title: '  ' },
      links: { title: 'Ajuda', items: [{ label: 'FAQ', href: '/p/faq' }, { label: 'Ruim', href: 'javascript:x' }, { label: '', href: '/x' }] },
      contact: { whatsapp: '(11) 99348-2824', email: 'Contato@Loja.com.br', address: 'Av. Sapopemba, 700' },
      social: { instagram: '@vivi', newsletter: false },
      legal: { companyName: 'Vivi Moda LTDA', document: '12.345.678/0001-90' },
    });
    expect(config.departments).toEqual({ enabled: false, title: 'Departamentos' });
    expect(config.links.items).toEqual([{ label: 'FAQ', href: '/p/faq' }]);
    expect(config.links.title).toBe('Ajuda');
    expect(config.contact.whatsapp).toBe('11993482824');
    expect(config.contact.email).toBe('contato@loja.com.br');
    expect(config.social.instagram).toBe('https://instagram.com/vivi');
    expect(config.social.newsletter).toBe(false);
    expect(config.legal.companyName).toBe('Vivi Moda LTDA');
  });

  it('keeps the Fidelizei link only when it is a web address', () => {
    expect(readFooterConfig({ fidelizei: { url: 'fidelizaplus.com.br/vivi' } }).fidelizei).toEqual({ enabled: true, url: 'https://fidelizaplus.com.br/vivi', text: DEFAULT_FOOTER.fidelizei.text });
    expect(readFooterConfig({ fidelizei: { enabled: false, url: 'javascript:alert(1)', text: '' } }).fidelizei).toEqual({ enabled: false, url: '', text: '' });
  });

  it('keeps an empty link list when the shop removed every link', () => {
    expect(readFooterConfig({ links: { items: [] } }).links.items).toEqual([]);
  });
});
