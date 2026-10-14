import { apiUrl } from './config';
import { toRequestItems, type CartItem } from './cart';

export type ShippingOption = { id: string; name: string; price: string; minDays: number; maxDays: number; free: boolean };
export type ShippingQuote = { state: string; subtotal: string; required: boolean; options: ShippingOption[] };
export type CepAddress = { street: string; district: string; city: string; state: string };

const CEP_KEY = 'storeos_cep';

export const onlyDigits = (value: string) => value.replace(/\D/g, '');

export function formatCep(value: string) {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export function deliveryTime({ minDays, maxDays }: Pick<ShippingOption, 'minDays' | 'maxDays'>) {
  if (maxDays === 0) return 'Entrega no mesmo dia';
  if (minDays === maxDays) return `${maxDays} ${maxDays === 1 ? 'dia útil' : 'dias úteis'}`;
  return `${minDays} a ${maxDays} dias úteis`;
}

/** Lembra o último CEP para o checkout já abrir com o frete calculado no carrinho. */
export function rememberCep(cep?: string) {
  try {
    if (cep === undefined) return sessionStorage.getItem(CEP_KEY) ?? '';
    sessionStorage.setItem(CEP_KEY, cep);
  } catch {
    // Sem storage (aba privada): só não lembra.
  }
  return cep ?? '';
}

export async function quoteShipping(storeSlug: string, zipCode: string, items: CartItem[]): Promise<ShippingQuote> {
  const response = await fetch(`${apiUrl}/shipping/quote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ storeSlug, zipCode, items: toRequestItems(items) }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 400 ? 'CEP inválido.' : body.message || 'Não foi possível calcular o frete.');
  return body;
}

/** Endereço pelo ViaCEP; falhas viram null e o cliente preenche à mão. */
export async function lookupCep(zipCode: string): Promise<CepAddress | null> {
  try {
    const response = await fetch(`https://viacep.com.br/ws/${onlyDigits(zipCode)}/json/`);
    const body = await response.json();
    if (!response.ok || body.erro) return null;
    return { street: body.logradouro ?? '', district: body.bairro ?? '', city: body.localidade ?? '', state: body.uf ?? '' };
  } catch {
    return null;
  }
}
