import type { Metadata } from 'next';

// A página do checkout é client-side; título e "não indexar" ficam aqui.
export const metadata: Metadata = { title: 'Finalizar compra', robots: { index: false } };

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
