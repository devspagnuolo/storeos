import { afterEach, describe, expect, it, vi } from 'vitest';
import { track } from './track';

afterEach(() => { vi.unstubAllGlobals(); });

describe('track', () => {
  const data = { value: 99.8, transactionId: 'SO-1', items: [{ id: 'p1', name: 'Vestido', price: 49.9, quantity: 2 }] };

  it('não faz nada sem navegador nem serviços ligados', () => {
    expect(() => track('purchase', data)).not.toThrow();
    vi.stubGlobal('window', {});
    expect(() => track('purchase', data)).not.toThrow();
  });

  it('manda a compra para o Google e para o Meta no formato de cada um', () => {
    const gtag = vi.fn(); const fbq = vi.fn();
    vi.stubGlobal('window', { gtag, fbq });
    track('purchase', data);
    expect(gtag).toHaveBeenCalledWith('event', 'purchase', { currency: 'BRL', value: 99.8, items: [{ item_id: 'p1', item_name: 'Vestido', price: 49.9, quantity: 2 }], transaction_id: 'SO-1' });
    expect(fbq).toHaveBeenCalledWith('track', 'Purchase', { currency: 'BRL', value: 99.8, content_ids: ['p1'], content_type: 'product', num_items: 2 });
  });

  it('usa o dataLayer quando só o Tag Manager está ligado e ignora erro do script', () => {
    const dataLayer: unknown[] = [];
    vi.stubGlobal('window', { dataLayer });
    track('add_to_cart', data);
    expect(dataLayer[0]).toMatchObject({ event: 'add_to_cart', ecommerce: { currency: 'BRL', value: 99.8 } });
    vi.stubGlobal('window', { gtag: () => { throw new Error('bloqueado'); } });
    expect(() => track('view_item', data)).not.toThrow();
  });
});
