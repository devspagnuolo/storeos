import { LoyaltyEntryType, Prisma } from '@prisma/client';
import { loadRules } from './rules-store';
import { pointsForOrder } from './tiers';

type Tx = Prisma.TransactionClient;

/** Credita os pontos do pedido pago. A chave única (pedido, tipo) torna a operação idempotente. */
export async function earnForOrder(tx: Tx, order: { id: string; storeId: string; customerId: string | null; subtotal: Prisma.Decimal; discount: Prisma.Decimal; promotionDiscount?: Prisma.Decimal; number: string }) {
  if (!order.customerId) return;
  const rules = await loadRules(tx, order.storeId);
  if (!rules.enabled) return;
  const lifetime = (await tx.loyaltyEntry.aggregate({ where: { customerId: order.customerId, type: { in: [LoyaltyEntryType.EARN, LoyaltyEntryType.REVERSAL] }, NOT: { orderId: order.id } }, _sum: { points: true } }))._sum.points ?? 0;
  const points = pointsForOrder(order.subtotal, order.discount.plus(order.promotionDiscount ?? 0), rules, lifetime);
  if (!points) return;
  await tx.loyaltyEntry.upsert({
    where: { orderId_type: { orderId: order.id, type: LoyaltyEntryType.EARN } },
    create: { storeId: order.storeId, customerId: order.customerId, orderId: order.id, type: LoyaltyEntryType.EARN, points, note: `Pedido ${order.number}` },
    update: {},
  });
}

/** Devolução: tira os pontos que o pedido tinha rendido (uma única vez). */
export async function reverseForOrder(tx: Tx, order: { id: string; storeId: string; customerId: string | null; number: string }) {
  if (!order.customerId) return;
  const earned = await tx.loyaltyEntry.findUnique({ where: { orderId_type: { orderId: order.id, type: LoyaltyEntryType.EARN } } });
  if (!earned) return;
  await tx.loyaltyEntry.upsert({
    where: { orderId_type: { orderId: order.id, type: LoyaltyEntryType.REVERSAL } },
    create: { storeId: order.storeId, customerId: order.customerId, orderId: order.id, type: LoyaltyEntryType.REVERSAL, points: -earned.points, note: `Devolução do pedido ${order.number}` },
    update: {},
  });
}
