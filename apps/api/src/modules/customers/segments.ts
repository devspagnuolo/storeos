export const SEGMENTS = ['PROSPECT', 'NEW', 'RECURRING', 'VIP', 'AT_RISK'] as const;
export type Segment = (typeof SEGMENTS)[number];

/** Limiares da segmentação automática. A mesma regra roda em SQL (listagem) e aqui (perfil). */
export const AT_RISK_DAYS = 90;
export const VIP_ORDERS = 5;
export const VIP_SPENT = 2000;

export type CustomerStats = { paidOrders: number; totalSpent: number; lastPaidAt: Date | null };

export function classifyCustomer({ paidOrders, totalSpent, lastPaidAt }: CustomerStats, now = new Date()): Segment {
  if (paidOrders === 0 || !lastPaidAt) return 'PROSPECT';
  if (now.getTime() - lastPaidAt.getTime() > AT_RISK_DAYS * 86_400_000) return 'AT_RISK';
  if (paidOrders >= VIP_ORDERS || totalSpent >= VIP_SPENT) return 'VIP';
  return paidOrders >= 2 ? 'RECURRING' : 'NEW';
}
