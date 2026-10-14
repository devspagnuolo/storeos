import { apiUrl, storeSlug } from './api';
import type { CartItem } from './cart';

export type CheckoutForm = {
  name: string; email: string;
  zipCode: string; street: string; number: string; complement?: string; district?: string; city: string; state: string;
  paymentMethod: 'PIX' | 'BOLETO';
};

export type CheckoutResult = {
  number: string; status: string; total: string; currency: string;
  items: { sku: string; name: string; quantity: number; total: string }[];
  payment: { method: string; status: string; instructions: Record<string, string> };
};

/** Envia o pedido direto do navegador para a API; o rate limit da API considera o IP de cada cliente. */
export async function submitCheckout(form: CheckoutForm, items: CartItem[]): Promise<CheckoutResult> {
  const { name, email, paymentMethod, ...address } = form;
  const response = await fetch(`${apiUrl}/checkout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      storeSlug,
      customer: { name, email },
      shippingAddress: { ...address, state: address.state.toUpperCase(), complement: address.complement || undefined, district: address.district || undefined },
      items: items.map(i => ({ productId: i.productId, quantity: i.quantity })),
      paymentMethod,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(body.message) ? 'Confira os dados informados.' : body.message;
    throw new Error(response.status === 429 ? 'Muitas tentativas. Aguarde um minuto e tente novamente.' : message || 'Não foi possível concluir o pedido.');
  }
  return body;
}
