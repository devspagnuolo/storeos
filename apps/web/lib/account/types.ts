export type AccountAddress = { zipCode?: string; street?: string; number?: string; complement?: string; district?: string; city?: string; state?: string };

export type AccountProfile = {
  name: string; email: string; phone: string | null; document: string | null; marketingOptIn: boolean; since: string; orders: number;
  address: AccountAddress | null;
  loyalty: { balance: number; tier: { name: string } | null; valuePerPoint: number; minRedeem: number; entries: { id: string; type: string; points: number; note: string | null; createdAt: string }[] } | null;
};

export type AccountOrderSummary = { number: string; status: string; statusLabel: string; total: string; createdAt: string; items: number; preview: { name: string; imageUrl: string | null }[] };

export type AccountOrder = {
  number: string; status: string; statusLabel: string; createdAt: string;
  subtotal: string; discount: string; shipping: string; total: string; shippingMethod: string | null; couponCode: string | null; address: AccountAddress | null;
  items: { name: string; sku: string; quantity: number; unitPrice: string; total: string; imageUrl: string | null; productSlug: string | null }[];
  payment: { method: string; status: string; paidAt: string | null; expiresAt: string | null; instructions: { message?: string; pixCode?: string; qrCodeBase64?: string; ticketUrl?: string; barcode?: string } | null } | null;
  timeline: { status: string; label: string; at: string }[];
  tracking: { carrier: string | null; code: string; url: string | null; shippedAt: string | null; deliveredAt: string | null } | null;
  invoice: { number: string; key: string | null } | null;
};

export const PAYMENT_LABEL: Record<string, string> = { PIX: 'Pix', BOLETO: 'Boleto', CREDIT_CARD: 'Cartão de crédito' };

/** Cor do selo de situação: pago/andamento em azul, entregue em verde, cancelado em cinza, aguardando em âmbar. */
export function statusTone(status: string) {
  if (status === 'AWAITING_PAYMENT' || status === 'NEW') return 'bg-amber-50 text-amber-800 ring-amber-200';
  if (status === 'DELIVERED') return 'bg-emerald-50 text-emerald-800 ring-emerald-200';
  if (status === 'CANCELLED' || status === 'REFUNDED' || status === 'RETURNED') return 'bg-slate-100 text-slate-600 ring-slate-200';
  return 'bg-sky-50 text-sky-800 ring-sky-200';
}

export const formatDate = (value: string | null | undefined, withTime = false) =>
  value ? new Date(value).toLocaleString('pt-BR', withTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'medium' }) : '';

export function addressLines(address: AccountAddress | null) {
  if (!address?.street) return [];
  return [
    `${address.street}, ${address.number ?? 's/n'}${address.complement ? ` – ${address.complement}` : ''}`,
    [address.district, `${address.city ?? ''}${address.state ? `/${address.state}` : ''}`].filter(Boolean).join(' · '),
    address.zipCode ? `CEP ${address.zipCode}` : '',
  ].filter(Boolean);
}

export type FidelizeiReward = { id: string; name: string; description: string | null; pointsCost: number; discountType: string; discountValue: number; minimumOrderCents: number; validUntil: string | null; canRedeem: boolean };
/** Programa Fidelizei visto pela cliente: desligado, ainda sem adesão, ou com saldo e benefícios. */
export type FidelizeiLoyalty =
  | { enabled: false }
  | { enabled: true; enrolled: false; termsUrl: string | null; privacyUrl: string | null; hasDocument: boolean }
  | { enabled: true; enrolled: true; termsUrl: string | null; privacyUrl: string | null; hasDocument: boolean; available: boolean; balance: number | null; rewards: FidelizeiReward[] };
export type ReservedReward = { checkoutId: string; code: string; rewardName: string; pointsDebited: number; discount: { type: string; value: number; minimumOrderCents?: number }; reservationExpiresAt: string; balance: number | null };

export const rewardLabel = (reward: { discountType: string; discountValue: number }) => reward.discountType === 'percent' ? `${reward.discountValue}% de desconto` : `${(reward.discountValue / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} de desconto`;

/** Mesmo cálculo do servidor (que é quem manda): percentual sobre os produtos já com promoções, fixo em centavos, nunca acima dos produtos. */
export function rewardAmount(discount: { type: string; value: number }, base: number) {
  if (!(discount.value > 0) || base <= 0) return 0;
  const raw = discount.type === 'percent' ? base * Math.min(discount.value, 100) / 100 : discount.value / 100;
  return Math.min(Math.round(raw * 100 + Number.EPSILON) / 100, base);
}
