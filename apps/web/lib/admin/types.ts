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
export type AdminProduct = { id: string; name: string; slug: string; sku: string; price: string; status: string; description: string | null; stock: number; reserved: number; images: { url: string }[]; categoryIds?: string[]; brandId?: string | null; seoTitle?: string | null; seoDescription?: string | null; updatedAt: string };
export type AdminProductPage = { items: AdminProduct[]; total: number; page: number; pageSize: number };

export type ShippingRule = { id: string; name: string; states: string[]; price: string; freeAbove: string | null; minDays: number; maxDays: number; active: boolean; position: number };

export type AuditRow = { id: string; action: string; entity: string | null; entityId: string | null; outcome: 'SUCCESS' | 'DENIED' | 'FAILURE'; statusCode: number | null; ip: string | null; userAgent: string | null; createdAt: string; metadata: Record<string, unknown> | null; actor: { id: string; name: string; email: string } | null };
export type AuditPage = { items: AuditRow[]; total: number; page: number; pageSize: number };

export type AdminCoupon = { id: string; code: string; description: string | null; type: 'PERCENT' | 'FIXED' | 'FREE_SHIPPING'; value: string; minSubtotal: string | null; maxUses: number | null; usedCount: number; oncePerCustomer: boolean; startsAt: string | null; endsAt: string | null; active: boolean };

export type AdminCollection = { id: string; name: string; slug: string; description: string | null; active: boolean; position: number; skus: string[] };

export type Segment = 'PROSPECT' | 'NEW' | 'RECURRING' | 'VIP' | 'AT_RISK';
export type CustomerRow = { id: string; name: string; email: string; tags: string[]; marketingOptIn: boolean; createdAt: string; paidOrders: number; totalSpent: string; lastPaidAt: string | null; segment: Segment };
export type CustomerPage = { items: CustomerRow[]; total: number; page: number; pageSize: number; segments: Record<Segment, number> };
export type CustomerProfile = {
  id: string; name: string; email: string; phone: string | null; notes: string | null; tags: string[]; marketingOptIn: boolean; createdAt: string;
  addresses: { id: string }[];
  orders: { id: string; number: string; status: string; total: string; couponCode: string | null; createdAt: string }[];
  stats: { paidOrders: number; ltv: string; averageTicket: string; firstPurchaseAt: string | null; lastPurchaseAt: string | null; segment: Segment };
};

export type SalesReport = {
  from: string; to: string;
  totals: { revenue: string; orders: number; averageTicket: string; discount: string; shipping: string; buyers: number; newCustomers: number };
  series: { day: string; revenue: string; orders: number }[];
  topProducts: { sku: string; name: string; quantity: number; revenue: string }[];
  funnel: { stage: string; count: number }[];
  cancelled: number; returned: number;
  coupons: { code: string; uses: number; discount: string }[];
};

export type LoyaltySummary = {
  balance: number; lifetime: number; valuePerPoint: number;
  tier: { key: string; label: string; next: { key: string; label: string; missing: number } | null };
  entries: { id: string; type: 'EARN' | 'REVERSAL' | 'REDEEM' | 'ADJUST'; points: number; note: string | null; createdAt: string }[];
};

export type AdminPage = { id: string; slug: string; title: string; body: string; published: boolean; showInFooter: boolean; position: number; seoDescription: string | null };
