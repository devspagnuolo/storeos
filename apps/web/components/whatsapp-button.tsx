'use client';
import { usePathname } from 'next/navigation';
import { whatsappLink } from '../lib/whatsapp';

/** Botão flutuante de WhatsApp da vitrine. Some no painel e no checkout, onde o foco é outro. */
export function WhatsAppButton({ number, message }: { number?: string | null; message?: string | null }) {
  const pathname = usePathname();
  if (!number || /^\/(admin|painel|checkout)(\/|$)/.test(pathname)) return null;
  return (
    <a href={whatsappLink(number, message)} target="_blank" rel="noopener noreferrer" aria-label="Falar com a loja no WhatsApp"
      className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
      <svg viewBox="0 0 32 32" width="30" height="30" fill="currentColor" aria-hidden="true"><path d="M16 3C9 3 3.4 8.6 3.4 15.5c0 2.2.6 4.4 1.7 6.3L3 29l7.4-2c1.8 1 3.8 1.500 5.800 1.500 7 0 12.600-5.600 12.600-12.500S23 3 16 3zm0 22.800c-1.800 0-3.600-.5-5.100-1.400l-.4-.2-4.400 1.200 1.200-4.300-.3-.4a10.300 10.300 0 0 1-1.600-5.500C5.400 9.700 10.100 5.100 16 5.100s10.600 4.600 10.600 10.400S21.800 25.800 16 25.800zm5.800-7.700c-.3-.2-1.900-.9-2.200-1s-.5-.2-.7.200-.8 1-1 1.200-.4.200-.7.100a8.600 8.600 0 0 1-4.300-3.700c-.3-.6.300-.6.900-1.800.1-.2.100-.4 0-.5l-1-2.300c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.6.100-.9.400s-1.200 1.200-1.200 2.900 1.200 3.300 1.400 3.500 2.400 3.700 5.900 5.200c2.200.9 3 1 4.100.8.700-.1 1.900-.8 2.200-1.500s.3-1.400.2-1.500-.3-.2-.6-.4z"/></svg>
    </a>
  );
}
