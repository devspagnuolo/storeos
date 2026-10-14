'use client';
import { createContext, useContext } from 'react';
import type { MenuLink } from '../lib/api';

export type StoreBrand = { name: string; logoUrl: string | null; slug: string };
export type StoreMenus = { main: MenuLink[]; footer: MenuLink[] | null };
const StoreBrandContext = createContext<StoreBrand>({ name: 'Loja', logoUrl: null, slug: 'demo' });
const StoreMenusContext = createContext<StoreMenus>({ main: [], footer: null });

export function StoreNameProvider({ name, logoUrl, slug, menus, children }: { name: string; logoUrl: string | null; slug: string; menus?: StoreMenus; children: React.ReactNode }) {
  return <StoreBrandContext.Provider value={{ name, logoUrl, slug }}><StoreMenusContext.Provider value={menus ?? { main: [], footer: null }}>{children}</StoreMenusContext.Provider></StoreBrandContext.Provider>;
}

export const useStoreBrand = () => useContext(StoreBrandContext);
export const useStoreMenus = () => useContext(StoreMenusContext);
