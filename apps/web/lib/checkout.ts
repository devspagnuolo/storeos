import { apiUrl, storeSlug } from './api';
import type { CartItem } from './cart';

export type CheckoutForm = {
  name: string; email: string;
  zipCode: string; street: string; number: string; complement?: string; district?: string; city: string; state: string;
  paymentMethod: 'PIX' | 'BOLETO';
  shippingRuleId?: string;
  couponCode?: string;
};

export type CheckoutResult = {
  number: string; status: string; subtotal: string; discount: string; couponCode: string | null; shipping: string; shippingMethod: string | null; total: string; currency: string;
  items: { sku: string; name: string; quantity: number; total: string }[];
  payment: { method: string; status: string; expiresAt?: string; instructions: { message: string; pixCode?: string; qrCodeBase64?: string; ticketUrl?: string } };
};

/** Envia o pedido direto do navegador para a API; o rate limit da API considera o IP de cada cliente. */
export async function submitCheckout(form: CheckoutForm, items: CartItem[]): Promise<CheckoutResult> {
  const { name, email, paymentMethod, shippingRuleId, couponCode, ...address } = form;
  const response = await fetch(`${apiUrl}/checkout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      storeSlug,
      customer: { name, email },
      shippingAddress: { ...address, state: address.state.toUpperCase(), complement: address.complement || undefined, district: address.district || undefined },
      items: items.map(i => ({ productId: i.productId, quantity: i.quantity })),
      paymentMethod,
      shippingRuleId,
      couponCode: couponCode || undefined,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(body.message) ? 'Confira os dados informados.' : body.message;
    throw new Error(response.status === 429 ? 'Muitas tentativas. Aguarde um minuto e tente novamente.' : message || 'Não foi possível concluir o pedido.');
  }
  return body;
}

/** Pré-visualiza o desconto; o servidor aplica a mesma regra de novo ao fechar o pedido. */
export async function previewCoupon(code: string, items: CartItem[], shipping: number): Promise<{ code: string; discount: string }> {
  const response = await fetch(`${apiUrl}/coupons/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ storeSlug, code, shipping, items: items.map(i => ({ productId: i.productId, quantity: i.quantity })) }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 429 ? 'Muitas tentativas. Aguarde um minuto.' : (Array.isArray(body.message) ? 'Cupom inválido' : body.message) || 'Cupom inválido');
  return body;
}
