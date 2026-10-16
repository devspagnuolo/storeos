import { DEFAULT_PACKAGE } from '../shipping/carrier';
import type { SuperFreteAddress, SuperFreteLabelInput } from '../shipping/superfrete.client';

/** Remetente das etiquetas, cadastrado no painel em Frete. */
export type ShippingSender = { name: string; document: string; phone?: string; street: string; number: string; complement?: string; district: string; city: string; state: string };
export type OrderAddress = { zipCode: string; street: string; number: string; complement?: string; district?: string; city: string; state: string };

const SUPERFRETE_BY_NAME: Record<string, number> = { 'correios pac': 1, 'correios sedex': 2, 'correios mini envios': 17 };

/**
 * Serviço do SuperFrete escolhido no checkout ("sf:2" = SEDEX). Pedidos antigos, de antes de guardarmos a opção,
 * são reconhecidos pelo nome exato que a cotação do SuperFrete gera. Frete de regra própria da loja não tem etiqueta automática.
 */
export function superFreteService(order: { shippingOptionId: string | null; shippingMethod: string | null }): number | null {
  const fromId = /^sf:(\d+)$/.exec(order.shippingOptionId ?? '');
  if (fromId) return Number(fromId[1]);
  if (order.shippingOptionId) return null;
  return SUPERFRETE_BY_NAME[(order.shippingMethod ?? '').trim().toLowerCase()] ?? null;
}

const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

/** O que falta no remetente para comprar etiquetas (lista vazia = completo). */
export function senderProblems(sender: Partial<ShippingSender> | null | undefined, originZip: string): string[] {
  const problems: string[] = [];
  if (!sender?.name?.trim()) problems.push('nome do remetente');
  if (![11, 14].includes(digits(sender?.document).length)) problems.push('CPF ou CNPJ do remetente');
  if (!sender?.street?.trim()) problems.push('rua');
  if (!sender?.number?.trim()) problems.push('número');
  if (!sender?.district?.trim()) problems.push('bairro');
  if (!sender?.city?.trim()) problems.push('cidade');
  if (!/^[A-Z]{2}$/.test(sender?.state ?? '')) problems.push('estado');
  if (digits(originZip).length !== 8) problems.push('CEP de origem');
  return problems;
}

type Dimensions = { weightGrams: number | null; widthCm: number | null; heightCm: number | null; lengthCm: number | null };

/** Uma caixa só: peças empilhadas (alturas somadas), largura e comprimento da maior peça, peso total. */
export function packageVolume(items: { quantity: number; product: Dimensions | null }[]) {
  let weight = 0, width = 1, length = 1, height = 0;
  for (const { quantity, product } of items) {
    weight += quantity * (product?.weightGrams ?? DEFAULT_PACKAGE.weightGrams);
    width = Math.max(width, product?.widthCm ?? DEFAULT_PACKAGE.widthCm);
    length = Math.max(length, product?.lengthCm ?? DEFAULT_PACKAGE.lengthCm);
    height += quantity * (product?.heightCm ?? DEFAULT_PACKAGE.heightCm);
  }
  return { weight: Math.max(weight / 1000, 0.01), width, length, height: Math.min(Math.max(height, 1), 100) };
}

export function buildLabelInput(input: {
  service: number; orderNumber: string; sender: ShippingSender; originZip: string;
  customer: { name: string; email: string; phone: string | null; document: string | null }; address: OrderAddress;
  items: { name: string; quantity: number; unitPrice: number; product: Dimensions | null }[];
  invoice: { number: string | null; key: string | null } | null;
}): SuperFreteLabelInput {
  const from: SuperFreteAddress = {
    name: input.sender.name.trim(), document: digits(input.sender.document), address: input.sender.street.trim(), number: input.sender.number.trim(),
    ...(input.sender.complement?.trim() && { complement: input.sender.complement.trim() }), district: input.sender.district.trim(),
    city: input.sender.city.trim(), state_abbr: input.sender.state, postal_code: digits(input.originZip),
    ...(input.sender.phone && { phone: digits(input.sender.phone) }),
  };
  const to: SuperFreteAddress = {
    name: input.customer.name, email: input.customer.email, address: input.address.street, number: input.address.number,
    ...(input.address.complement && { complement: input.address.complement }), district: input.address.district?.trim() || 'Centro',
    city: input.address.city, state_abbr: input.address.state, postal_code: digits(input.address.zipCode),
    ...(input.customer.document && { document: digits(input.customer.document) }), ...(input.customer.phone && { phone: digits(input.customer.phone) }),
  };
  const key = digits(input.invoice?.key);
  return {
    from, to, service: input.service, platform: 'StoreOS', tag: input.orderNumber,
    products: input.items.map(item => ({ name: item.name.slice(0, 100), quantity: item.quantity, unitary_value: item.unitPrice })),
    volumes: packageVolume(input.items),
    // Mesmas opções da cotação do checkout, para o preço da etiqueta bater com o frete cobrado.
    options: {
      insurance_value: 0, receipt: false, own_hand: false,
      ...(key.length === 44 ? { non_commercial: false, invoice: { number: input.invoice!.number ?? '', key } } : { non_commercial: true }),
    },
  };
}
