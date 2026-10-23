'use client';
import { ShippingCalculator } from './shipping-calculator';

/** Frete e prazo na página do produto, para o cliente saber o custo antes de ir ao carrinho. Cota uma unidade. */
export function ProductShipping({ product }: { product: { id: string; slug: string; name: string; price: string } }) {
  return (
    <section aria-label="Calcular frete e prazo" className="mt-8">
      <h2 className="text-sm font-semibold">Calcular frete e prazo</h2>
      <ShippingCalculator items={[{ productId: product.id, slug: product.slug, name: product.name, price: product.price, quantity: 1 }]} bare />
    </section>
  );
}
