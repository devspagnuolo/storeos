export type DomainEvent<T = Record<string, unknown>> = { id: string; name: string; occurredAt: string; aggregateId: string; storeId: string; version: number; payload: T };
export type OrderCreatedEvent = DomainEvent<{ orderNumber: string; customerId: string; total: number; currency: string }>;
export const EventNames = { ORDER_CREATED: 'orders.order-created.v1', INVENTORY_RESERVED: 'inventory.reserved.v1', PRODUCT_PUBLISHED: 'catalog.product-published.v1' } as const;

export * from './theme-engine';
