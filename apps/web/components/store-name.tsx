'use client';
import { createContext, useContext } from 'react';

export type StoreBrand = { name: string; logoUrl: string | null };
const StoreBrandContext = createContext<StoreBrand>({ name: 'Loja', logoUrl: null });

export function StoreNameProvider({ name, logoUrl, children }: { name: string; logoUrl: string | null; children: React.ReactNode }) {
  return <StoreBrandContext.Provider value={{ name, logoUrl }}>{children}</StoreBrandContext.Provider>;
}

export const useStoreBrand = () => useContext(StoreBrandContext);
