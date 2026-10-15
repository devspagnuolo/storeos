import { evaluateReadiness, ReadinessFacts } from './store-readiness';

const base: ReadinessFacts = {
  storeName: 'Vivi', hasLogo: true, whatsapp: true, activeProducts: 3, stockedProducts: 3, productsWithoutImage: 0, productsWithoutPrice: 0,
  storefrontCustomized: true, shippingRules: 1, carrierConfigured: false, paymentConfigured: true, webhookConfigured: true, callbackConfigured: true,
  cardConfigured: false, confirmedPayments: 1, publishedPageSlugs: ['trocas-e-devolucoes', 'politica-de-privacidade'], emailConfigured: false, blingConnected: false, activeDomains: 0,
};

describe('prontidão da loja', () => {
  it('só exige os passos obrigatórios para liberar a divulgação', () => {
    const result = evaluateReadiness(base);
    expect(result.ready).toBe(true);
    expect(result.pendingRequired).toEqual([]);
    expect(result.completed).toBeLessThan(result.total);
  });
  it.each([
    ['sem logo', { hasLogo: false }, 'identity'],
    ['produto sem foto', { productsWithoutImage: 1 }, 'catalog-quality'],
    ['produto sem preço', { productsWithoutPrice: 2 }, 'catalog-quality'],
    ['sem política de privacidade', { publishedPageSlugs: ['trocas'] }, 'policies'],
    ['sem política de trocas', { publishedPageSlugs: ['privacidade'] }, 'policies'],
    ['sem compra de teste', { confirmedPayments: 0 }, 'payment'],
    ['callback sem https', { callbackConfigured: false }, 'payment'],
  ])('bloqueia: %s', (_, patch, id) => {
    const result = evaluateReadiness({ ...base, ...patch });
    expect(result.ready).toBe(false);
    expect(result.pendingRequired).toContain(id);
  });
  it('pede o perfil do negócio e separa o que bloqueia a abertura da loja', () => {
    expect(evaluateReadiness({ ...base, profileDone: false }).pendingRequired).toContain('profile');
    // Sem compra de teste a loja ainda pode abrir; é a abertura que permite fazê-la.
    expect(evaluateReadiness({ ...base, confirmedPayments: 0 }).launchBlockers).toEqual([]);
    expect(evaluateReadiness({ ...base, confirmedPayments: 0, webhookConfigured: false }).launchBlockers).toEqual(['payment']);
  });
  it('itens recomendados pendentes não bloqueiam', () => {
    const result = evaluateReadiness({ ...base, blingConnected: false, emailConfigured: false, whatsapp: false });
    expect(result.ready).toBe(true);
  });
});
