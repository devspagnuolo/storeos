export type OrderRow = { id: string; number: string; status: string; total: string; createdAt: string; customer: { name: string; email: string } | null; payments: { method: string; status: string; provider: string }[]; _count: { items: number } };
export type OrderPage = { items: OrderRow[]; total: number; page: number; pageSize: number };
export type OrderDetail = Omit<OrderRow, 'payments' | '_count'> & {
  subtotal: string; shipping: string; discount: string; shippingMethod: string | null;
  shippingAddress: { zipCode: string; street: string; number: string; complement?: string; district?: string; city: string; state: string } | null;
  items: { id: string; sku: string; name: string; quantity: number; unitPrice: string; total: string }[];
  payments: { id: string; method: string; status: string; provider: string; transactionId: string | null; amount: string; expiresAt: string | null; paidAt: string | null }[];
  timeline: { id: string; status: string; message: string | null; createdAt: string }[];
  fulfillment: { invoiceNumber: string | null; invoiceKey: string | null; carrier: string | null; trackingCode: string | null; trackingUrl: string | null; shippedAt: string | null; deliveredAt: string | null; returnReason: string | null } | null;
};
export type Summary = { days: number; revenue: string; paidOrders: number; averageTicket: string; orders: number; awaitingPayment: number; paymentRate: number; lowStockProducts: number };
export type AdminProduct = { id: string; name: string; slug: string; sku: string; price: string; status: string; description: string | null; stock: number; reserved: number; images: { url: string }[]; categoryIds?: string[]; updatedAt: string };
export type AdminProductPage = { items: AdminProduct[]; total: number; page: number; pageSize: number };

export type ShippingRule = { id: string; name: string; states: string[]; price: string; freeAbove: string | null; minDays: number; maxDays: number; active: boolean; position: number };

export type AuditRow = { id: string; action: string; entity: string | null; entityId: string | null; outcome: 'SUCCESS' | 'DENIED' | 'FAILURE'; statusCode: number | null; ip: string | null; userAgent: string | null; createdAt: string; metadata: Record<string, unknown> | null; actor: { id: string; name: string; email: string } | null };
export type AuditPage = { items: AuditRow[]; total: number; page: number; pageSize: number };
