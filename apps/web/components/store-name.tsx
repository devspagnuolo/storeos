'use client';
import { createContext, useContext } from 'react';

const StoreNameContext = createContext('Loja');

export function StoreNameProvider({ name, children }: { name: string; children: React.ReactNode }) {
  return <StoreNameContext.Provider value={name}>{children}</StoreNameContext.Provider>;
}

export const useStoreName = () => useContext(StoreNameContext);
