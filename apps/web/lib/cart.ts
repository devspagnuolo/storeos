import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { toCents } from './format';

export type CartItem = { productId: string; slug: string; name: string; price: string; image?: string; quantity: number };

export const MAX_QUANTITY = 99;

const clamp = (quantity: number) => Math.min(Math.max(Math.trunc(quantity), 0), MAX_QUANTITY);

export function addItem(items: CartItem[], item: Omit<CartItem, 'quantity'>, quantity = 1): CartItem[] {
  const existing = items.find(i => i.productId === item.productId);
  if (!existing) return [...items, { ...item, quantity: clamp(quantity) }];
  return items.map(i => (i.productId === item.productId ? { ...i, ...item, quantity: clamp(i.quantity + quantity) } : i));
}

export function setQuantity(items: CartItem[], productId: string, quantity: number): CartItem[] {
  const next = clamp(quantity);
  return next ? items.map(i => (i.productId === productId ? { ...i, quantity: next } : i)) : items.filter(i => i.productId !== productId);
}

export const cartCount = (items: CartItem[]) => items.reduce((sum, i) => sum + i.quantity, 0);

export const cartSubtotalCents = (items: CartItem[]) => items.reduce((sum, i) => sum + toCents(i.price) * i.quantity, 0);

type CartState = {
  items: CartItem[];
  add: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
};

export const useCart = create<CartState>()(
  persist(
    set => ({
      items: [],
      add: (item, quantity) => set(state => ({ items: addItem(state.items, item, quantity) })),
      setQuantity: (productId, quantity) => set(state => ({ items: setQuantity(state.items, productId, quantity) })),
      clear: () => set({ items: [] }),
    }),
    { name: 'storeos-cart', storage: createJSONStorage(() => localStorage) },
  ),
);
