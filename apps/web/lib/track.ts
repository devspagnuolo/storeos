'use client';

type Item = { item_id: string; item_name: string; price: number; quantity: number };
type W = Window & { gtag?: (...args: unknown[]) => void; fbq?: (...args: unknown[]) => void; dataLayer?: unknown[] };

const toItem = (i: { id: string; name: string; price: number; quantity?: number }): Item => ({ item_id: i.id, item_name: i.name, price: i.price, quantity: i.quantity ?? 1 });

/** Dispara o evento nos serviços que a loja ligou (Google Analytics, Tag Manager, Meta). Sem nenhum ligado, não faz nada. */
export function track(event: 'view_item' | 'add_to_cart' | 'begin_checkout' | 'purchase', data: { value: number; items: { id: string; name: string; price: number; quantity?: number }[]; transactionId?: string }) {
  if (typeof window === 'undefined') return;
  const w = window as W;
  const items = data.items.map(toItem);
  try {
    if (w.gtag) w.gtag('event', event, { currency: 'BRL', value: data.value, items, ...(data.transactionId && { transaction_id: data.transactionId }) });
    else w.dataLayer?.push({ event, ecommerce: { currency: 'BRL', value: data.value, items, ...(data.transactionId && { transaction_id: data.transactionId }) } });
    const pixel = { view_item: 'ViewContent', add_to_cart: 'AddToCart', begin_checkout: 'InitiateCheckout', purchase: 'Purchase' }[event];
    w.fbq?.('track', pixel, { currency: 'BRL', value: data.value, content_ids: data.items.map(i => i.id), content_type: 'product', num_items: data.items.reduce((n, i) => n + (i.quantity ?? 1), 0) });
  } catch {
    // Bloqueador de anúncios ou script que não carregou: a compra segue normalmente.
  }
}
