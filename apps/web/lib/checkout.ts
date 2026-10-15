import { apiUrl } from './config';
import { toRequestItems, type CartItem } from './cart';

export type CheckoutForm = {
  name: string; email: string;
  zipCode: string; street: string; number: string; complement?: string; district?: string; city: string; state: string;
  paymentMethod: 'PIX' | 'BOLETO' | 'CREDIT_CARD';
  cpf?: string;
  shippingRuleId?: string;
  couponCode?: string;
};

export type CheckoutResult = {
  number: string; status: string; subtotal: string; discount: string; promotionDiscount: string; promotions: { name: string; amount: string }[]; couponCode: string | null; shipping: string; shippingMethod: string | null; total: string; currency: string;
  items: { sku: string; name: string; quantity: number; total: string }[];
  payment: { method: string; status: string; expiresAt?: string; instructions: { message: string; pixCode?: string; qrCodeBase64?: string; ticketUrl?: string; barcode?: string; installments?: number } };
};

/** Envia o pedido direto do navegador para a API; o rate limit da API considera o IP de cada cliente. */
export async function submitCheckout(storeSlug: string, form: CheckoutForm, items: CartItem[], card?: import('../components/card-payment').CardPayload): Promise<CheckoutResult> {
  const { name, email, paymentMethod, shippingRuleId, couponCode, cpf, ...address } = form;
  const response = await fetch(`${apiUrl}/checkout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      storeSlug,
      customer: { name, email },
      shippingAddress: { ...address, state: address.state.toUpperCase(), complement: address.complement || undefined, district: address.district || undefined },
      items: toRequestItems(items),
      paymentMethod,
      shippingRuleId,
      couponCode: couponCode || undefined,
      cpf: cpf || undefined,
      card,
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
export async function previewCoupon(storeSlug: string, code: string, items: CartItem[], shipping: number): Promise<{ code: string; discount: string }> {
  const response = await fetch(`${apiUrl}/coupons/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ storeSlug, code, shipping, items: toRequestItems(items) }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 429 ? 'Muitas tentativas. Aguarde um minuto.' : (Array.isArray(body.message) ? 'Cupom inválido' : body.message) || 'Cupom inválido');
  return body;
}

export type PromotionPreview = { discount: string; applied: { id: string; name: string; amount: string }[] };

/** Promoções automáticas do carrinho; o checkout recalcula as mesmas regras no servidor. */
export async function previewPromotions(storeSlug: string, items: CartItem[]): Promise<PromotionPreview> {
  const response = await fetch(`${apiUrl}/promotions/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ storeSlug, items: toRequestItems(items) }),
  });
  if (!response.ok) return { discount: '0.00', applied: [] };
  return response.json();
}

/** Guarda o carrinho de quem já informou o e-mail, para a loja poder lembrar se a compra não for concluída. Falhas são silenciosas. */
export async function captureCart(storeSlug: string, email: string, name: string, items: CartItem[]): Promise<void> {
  if (!items.length || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return;
  try {
    await fetch(`${apiUrl}/abandoned-carts/capture`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storeSlug, email: email.trim(), name: name.trim() || undefined, items: toRequestItems(items) }), keepalive: true });
  } catch { /* a captura nunca atrapalha a compra */ }
}
