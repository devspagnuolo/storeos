/** Nomes de eventos de domínio/integração (versionados). Publicados via Outbox → RabbitMQ. */
export const EventNames = {
  STORE_CREATED: 'identity.store-created.v1',
  USER_INVITED: 'identity.user-invited.v1',
  CUSTOMER_REGISTERED: 'customers.customer-registered.v1',
  PRODUCT_CREATED: 'catalog.product-created.v1',
  PRODUCT_PUBLISHED: 'catalog.product-published.v1',
  PRODUCT_UPDATED: 'catalog.product-updated.v1',
  PRODUCT_DELETED: 'catalog.product-deleted.v1',
  INVENTORY_ADJUSTED: 'inventory.adjusted.v1',
  INVENTORY_RESERVED: 'inventory.reserved.v1',
  INVENTORY_LOW: 'inventory.low-stock.v1',
  CART_ABANDONED: 'cart.abandoned.v1',
  ORDER_CREATED: 'orders.order-created.v1',
  ORDER_STATUS_CHANGED: 'orders.order-status-changed.v1',
  ORDER_PAID: 'orders.order-paid.v1',
  ORDER_CANCELLED: 'orders.order-cancelled.v1',
  ORDER_SHIPPED: 'orders.order-shipped.v1',
  ORDER_DELIVERED: 'orders.order-delivered.v1',
  PAYMENT_CONFIRMED: 'payments.payment-confirmed.v1',
  PAYMENT_FAILED: 'payments.payment-failed.v1',
  PAYMENT_REFUNDED: 'payments.payment-refunded.v1',
  SHIPMENT_UPDATED: 'shipping.shipment-updated.v1',
  INTEGRATION_SYNC_REQUESTED: 'integrations.sync-requested.v1',
  LOYALTY_POINTS_EARNED: 'loyalty.points-earned.v1',
} as const;
export type EventName = (typeof EventNames)[keyof typeof EventNames];

export interface DomainEventEnvelope<T = Record<string, unknown>> {
  id: string;
  name: string;
  storeId: string;
  aggregateType: string;
  aggregateId: string;
  occurredAt: string;
  version: number;
  payload: T;
}

export interface OrderCreatedPayload {
  orderId: string;
  orderNumber: string;
  customerId: string | null;
  totalCents: number;
  currency: string;
}
export interface OrderStatusChangedPayload {
  orderId: string;
  orderNumber: string;
  from: string;
  to: string;
}
export interface OrderPaidPayload {
  orderId: string;
  orderNumber: string;
  customerId: string | null;
  totalCents: number;
  paymentId: string;
}
export interface ProductChangedPayload {
  productId: string;
  sku: string;
  slug: string;
}
