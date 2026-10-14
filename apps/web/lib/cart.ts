import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { toCents } from './format';

export type CartItem = { productId: string; variantId?: string; variantLabel?: string; slug: string; name: string; price: string; image?: string; quantity: number };

/** Chave da linha: o mesmo produto em variações diferentes ocupa linhas separadas. */
export const lineKey = (item: Pick<CartItem, 'productId' | 'variantId'>) => (item.variantId ? `${item.productId}:${item.variantId}` : item.productId);

/** Formato que a API de pedidos, frete e promoções espera. */
export const toRequestItems = (items: CartItem[]) => items.map(i => ({ productId: i.productId, ...(i.variantId && { variantId: i.variantId }), quantity: i.quantity }));

export const MAX_QUANTITY = 99;

const clamp = (quantity: number) => Math.min(Math.max(Math.trunc(quantity), 0), MAX_QUANTITY);

export function addItem(items: CartItem[], item: Omit<CartItem, 'quantity'>, quantity = 1): CartItem[] {
  const key = lineKey(item);
  const existing = items.find(i => lineKey(i) === key);
  if (!existing) return [...items, { ...item, quantity: clamp(quantity) }];
  return items.map(i => (lineKey(i) === key ? { ...i, ...item, quantity: clamp(i.quantity + quantity) } : i));
}

export function setQuantity(items: CartItem[], key: string, quantity: number): CartItem[] {
  const next = clamp(quantity);
  return next ? items.map(i => (lineKey(i) === key ? { ...i, quantity: next } : i)) : items.filter(i => lineKey(i) !== key);
}

export const cartCount = (items: CartItem[]) => items.reduce((sum, i) => sum + i.quantity, 0);

export const cartSubtotalCents = (items: CartItem[]) => items.reduce((sum, i) => sum + toCents(i.price) * i.quantity, 0);

type CartState = {
  items: CartItem[];
  add: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  setQuantity: (key: string, quantity: number) => void;
  clear: () => void;
};

export const useCart = create<CartState>()(
  persist(
    set => ({
      items: [],
      add: (item, quantity) => set(state => ({ items: addItem(state.items, item, quantity) })),
      setQuantity: (key, quantity) => set(state => ({ items: setQuantity(state.items, key, quantity) })),
      clear: () => set({ items: [] }),
    }),
    { name: 'storeos-cart', storage: createJSONStorage(() => localStorage) },
  ),
);
