'use client';
import { useEffect } from 'react';

/** Login e logout voltam para a mesma /conta; isto avisa o cabeçalho para reler o cookie-sinal. */
export function AccountSignal({ signedIn }: { signedIn: boolean }) {
  useEffect(() => { window.dispatchEvent(new Event('storeos:account')); }, [signedIn]);
  return null;
}
