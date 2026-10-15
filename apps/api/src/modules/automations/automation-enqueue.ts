import { OrderStatus, Prisma } from '@prisma/client';
import { Conditions, isTrigger, matchesConditions, orderStillValid } from './automation-rules';

const PAID: OrderStatus[] = [OrderStatus.PAID, OrderStatus.PICKING, OrderStatus.INVOICED, OrderStatus.SHIPPED, OrderStatus.DELIVERED];

/**
 * Chamado pelo processador de eventos: cria uma execução para cada regra ativa que combina com o evento do pedido.
 * A chave única (regra, evento) torna a chamada segura de repetir.
 */
export async function enqueueAutomationRuns(tx: Prisma.TransactionClient, event: { id: string; storeId: string; aggregateId: string; eventName: string }): Promise<number> {
  if (!isTrigger(event.eventName)) return 0;
  const rules = await tx.automationRule.findMany({ where: { storeId: event.storeId, trigger: event.eventName, active: true } });
  if (!rules.length) return 0;
  const order = await tx.order.findFirst({ where: { id: event.aggregateId, storeId: event.storeId }, select: { id: true, status: true, total: true, customerId: true, createdAt: true, payments: { select: { method: true }, orderBy: { createdAt: 'asc' }, take: 1 } } });
  if (!order?.customerId) return 0;
  const prior = await tx.order.count({ where: { storeId: event.storeId, customerId: order.customerId, id: { not: order.id }, status: { in: PAID }, createdAt: { lt: order.createdAt } } });
  const facts = { total: Number(order.total), paymentMethod: order.payments[0]?.method ?? null, priorPaidOrders: prior };
  const now = Date.now();
  const due = rules.filter(rule => matchesConditions(rule.conditions as Conditions, facts));
  if (!due.length) return 0;
  const created = await tx.automationRun.createMany({
    data: due.map(rule => ({ storeId: event.storeId, ruleId: rule.id, eventId: event.id, orderId: order.id, customerId: order.customerId, runAt: new Date(now + rule.delayMinutes * 60_000) })),
    skipDuplicates: true,
  });
  return created.count;
}

export { orderStillValid };
