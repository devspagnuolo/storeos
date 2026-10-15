import { Money, money } from '../../shared/money/money';

export const CARRIER_QUOTES = Symbol('CARRIER_QUOTES');

export type CarrierPackage = { id: string; widthCm: number; heightCm: number; lengthCm: number; weightKg: number; unitValue: number; quantity: number };
export type CarrierOffer = { id: string; name: string; price: Money; minDays: number; maxDays: number };

/** Cotação de frete em transportadoras. `enabled` = credenciais configuradas no servidor; o CEP de origem é por loja. */
export interface CarrierQuotes {
  readonly enabled: boolean;
  readonly provider: string;
  quote(input: { fromZip: string; toZip: string; packages: CarrierPackage[] }): Promise<CarrierOffer[]>;
}

/** Medidas usadas quando o produto ainda não tem peso e dimensões cadastrados (peça de roupa dobrada). */
export const DEFAULT_PACKAGE = { weightGrams: 300, widthCm: 20, heightCm: 5, lengthCm: 25 };

type Dimensional = { id: string; price: Money | string | number; weightGrams: number | null; widthCm: number | null; heightCm: number | null; lengthCm: number | null };

/** Um pacote por item do pedido, com o valor declarado do catálogo e medidas mínimas aceitas pelas transportadoras. */
export function buildPackages(items: { productId: string; quantity: number }[], products: Dimensional[]): CarrierPackage[] {
  return items.map(item => {
    const product = products.find(p => p.id === item.productId);
    return {
      id: item.productId,
      widthCm: Math.max(product?.widthCm ?? DEFAULT_PACKAGE.widthCm, 1),
      heightCm: Math.max(product?.heightCm ?? DEFAULT_PACKAGE.heightCm, 1),
      lengthCm: Math.max(product?.lengthCm ?? DEFAULT_PACKAGE.lengthCm, 1),
      weightKg: Math.max((product?.weightGrams ?? DEFAULT_PACKAGE.weightGrams) / 1000, 0.01),
      unitValue: product ? Number(money(product.price.toString())) : 0,
      quantity: item.quantity,
    };
  });
}
