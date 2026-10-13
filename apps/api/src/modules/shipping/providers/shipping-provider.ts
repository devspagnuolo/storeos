export interface QuotePackage {
  weightGrams: number;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  insuranceCents: number;
}

export interface QuoteRequest {
  storeId: string;
  originZip?: string;
  destinationZip: string;
  subtotalCents: number;
  items: { quantity: number; unitPriceCents: number; weightGrams: number; lengthMm: number; widthMm: number; heightMm: number }[];
  config: Record<string, unknown>;
}

export interface RawQuote {
  serviceCode: string | null;
  name: string;
  priceCents: number;
  estimatedDays: number;
}

/** Porta para cotação de frete. Cada transportadora/agregador é um adaptador. */
export interface ShippingProvider {
  readonly key: string;
  quote(request: QuoteRequest): Promise<RawQuote[]>;
}

/** Agrega itens em um único pacote (peso somado; dimensões pelo maior lado e altura empilhada). */
export function buildPackage(items: QuoteRequest['items']): QuotePackage {
  let weight = 0;
  let length = 0;
  let width = 0;
  let height = 0;
  let insurance = 0;
  for (const i of items) {
    weight += i.weightGrams * i.quantity;
    length = Math.max(length, i.lengthMm);
    width = Math.max(width, i.widthMm);
    height += i.heightMm * i.quantity;
    insurance += i.unitPriceCents * i.quantity;
  }
  return {
    weightGrams: Math.max(weight, 100),
    lengthMm: Math.max(length, 160),
    widthMm: Math.max(width, 110),
    heightMm: Math.max(height, 20),
    insuranceCents: insurance,
  };
}
