import { bannerIsLive, isSafeBannerLink, isValidEmail, normalizeEmail, normalizeWhatsapp, whatsappLink } from './engagement-rules';

describe('engagement-rules', () => {
  it('normaliza e valida e-mails', () => {
    expect(normalizeEmail('  Maria@Example.COM ')).toBe('maria@example.com');
    expect([isValidEmail('a@b.co'), isValidEmail('sem-arroba'), isValidEmail('a@b'), isValidEmail('a b@c.com')]).toEqual([true, false, false, false]);
  });
  it('normaliza o WhatsApp brasileiro', () => {
    expect(normalizeWhatsapp('(21) 99999-8888')).toBe('5521999998888');
    expect(normalizeWhatsapp('+55 21 3333-4444')).toBe('552133334444');
    expect(normalizeWhatsapp('123')).toBeUndefined();
    expect(normalizeWhatsapp('+1 415 555 0100')).toBeUndefined();
  });
  it('monta o link com a mensagem codificada', () => {
    expect(whatsappLink('5521999998888', 'Oi, quero ajuda!')).toBe('https://wa.me/5521999998888?text=Oi%2C%20quero%20ajuda!');
    expect(whatsappLink('5521999998888')).toBe('https://wa.me/5521999998888');
  });
  it('só aceita links internos ou https nos banners', () => {
    expect([isSafeBannerLink('/categorias/vestidos'), isSafeBannerLink('https://x.com/a'), isSafeBannerLink('//evil.com'), isSafeBannerLink('javascript:alert(1)'), isSafeBannerLink('http://x.com')]).toEqual([true, true, false, false, false]);
  });
  it('respeita ativo e janela de datas', () => {
    const now = new Date('2026-10-14T12:00:00Z');
    const day = (d: string) => new Date(d);
    expect(bannerIsLive({ active: true, startsAt: null, endsAt: null }, now)).toBe(true);
    expect(bannerIsLive({ active: false, startsAt: null, endsAt: null }, now)).toBe(false);
    expect(bannerIsLive({ active: true, startsAt: day('2026-10-15T00:00:00Z'), endsAt: null }, now)).toBe(false);
    expect(bannerIsLive({ active: true, startsAt: day('2026-10-01T00:00:00Z'), endsAt: day('2026-10-14T11:00:00Z') }, now)).toBe(false);
    expect(bannerIsLive({ active: true, startsAt: day('2026-10-01T00:00:00Z'), endsAt: day('2026-10-31T00:00:00Z') }, now)).toBe(true);
  });
});
