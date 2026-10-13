import { z } from 'zod';
import { paginationQuery } from './common';

export const orderStatusSchema = z.enum([
  'NEW',
  'AWAITING_PAYMENT',
  'PAID',
  'PICKING',
  'INVOICED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
  'RETURNED',
]);
export type OrderStatusValue = z.infer<typeof orderStatusSchema>;

/** Máquina de estados do OMS: transições permitidas. */
export const ORDER_TRANSITIONS: Record<OrderStatusValue, readonly OrderStatusValue[]> = {
  NEW: ['AWAITING_PAYMENT', 'PAID', 'CANCELLED'],
  AWAITING_PAYMENT: ['PAID', 'CANCELLED'],
  PAID: ['PICKING', 'INVOICED', 'CANCELLED', 'REFUNDED'],
  PICKING: ['INVOICED', 'SHIPPED', 'CANCELLED', 'REFUNDED'],
  INVOICED: ['SHIPPED', 'CANCELLED', 'REFUNDED'],
  SHIPPED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED', 'REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
  RETURNED: ['REFUNDED'],
};

export const adminOrderListQuery = paginationQuery.extend({
  status: orderStatusSchema.optional(),
  q: z.string().max(120).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const changeOrderStatusSchema = z.object({
  status: orderStatusSchema,
  note: z.string().max(500).optional(),
  trackingCode: z.string().max(60).optional(),
  carrier: z.string().max(60).optional(),
});
export const addOrderNoteSchema = z.object({
  message: z.string().min(1).max(1000),
  visibleToCustomer: z.boolean().default(false),
});
export const refundOrderSchema = z.object({
  amountCents: z.number().int().min(1).optional(),
  reason: z.string().min(2).max(300),
});

export interface OrderItemView {
  id: string;
  sku: string;
  name: string;
  variantName: string | null;
  imageUrl: string | null;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}
export interface TimelineEntryView {
  id: string;
  type: string;
  status: string | null;
  message: string;
  actorType: string;
  visibleToCustomer: boolean;
  createdAt: string;
}
export interface PaymentView {
  id: string;
  provider: string;
  method: string;
  status: string;
  amountCents: number;
  installments: number;
  paidAt: string | null;
}
export interface OrderSummaryView {
  id: string;
  number: string;
  status: string;
  paymentStatus: string;
  customerName: string;
  customerEmail: string;
  totalCents: number;
  itemsCount: number;
  placedAt: string;
}
export interface OrderDetailView extends OrderSummaryView {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  couponCode: string | null;
  shippingMethod: string | null;
  shippingAddress: Record<string, unknown>;
  trackingCode: string | null;
  trackingUrl: string | null;
  carrier: string | null;
  invoiceNumber: string | null;
  invoiceUrl: string | null;
  erpProvider: string | null;
  erpOrderId: string | null;
  erpSyncStatus: string | null;
  items: OrderItemView[];
  payments: PaymentView[];
  timeline: TimelineEntryView[];
  allowedTransitions: string[];
}
