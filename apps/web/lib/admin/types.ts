export type OrderRow = { id: string; number: string; status: string; total: string; createdAt: string; customer: { name: string; email: string } | null; payments: { method: string; status: string; provider: string }[]; blingSync: { status: string; blingOrderId: string | null; blingOrderNumber: string | null; blingSituationName: string | null } | null; _count: { items: number } };
export type OrderPage = { items: OrderRow[]; total: number; page: number; pageSize: number };
export type OrderDetail = Omit<OrderRow, 'payments' | '_count' | 'blingSync'> & {
  blingSync: (NonNullable<OrderRow['blingSync']> & { blingSituationId: string | null }) | null;
  subtotal: string; shipping: string; discount: string; shippingMethod: string | null;
  shippingAddress: { zipCode: string; street: string; number: string; complement?: string; district?: string; city: string; state: string } | null;
  items: { id: string; sku: string; name: string; quantity: number; unitPrice: string; total: string }[];
  payments: { id: string; method: string; status: string; provider: string; transactionId: string | null; amount: string; expiresAt: string | null; paidAt: string | null }[];
  timeline: { id: string; status: string; message: string | null; createdAt: string }[];
  fulfillment: { invoiceNumber: string | null; invoiceKey: string | null; carrier: string | null; trackingCode: string | null; trackingUrl: string | null; shippedAt: string | null; deliveredAt: string | null; returnReason: string | null } | null;
  shippingLabel?: { status: string; trackingCode: string | null; labelUrl: string | null; price: string | null; lastError: string | null; attempts: number; remoteStatus: string | null } | null;
};
export type Summary = { days: number; revenue: string; paidOrders: number; averageTicket: string; orders: number; awaitingPayment: number; paymentRate: number; lowStockProducts: number };
export type AdminVariant = { id: string; sku: string; price: string | null; attributes: { name: string; value: string }[]; stock: number; reserved: number; active: boolean };
export type AdminProduct = { ncm?: string | null; cest?: string | null; gtin?: string | null; taxOrigin?: number | null; unit?: string | null; variants?: AdminVariant[]; weightGrams?: number | null; widthCm?: number | null; heightCm?: number | null; lengthCm?: number | null; id: string; name: string; slug: string; sku: string; price: string; status: string; description: string | null; stock: number; reserved: number; images: { url: string }[]; categoryIds?: string[]; brandId?: string | null; seoTitle?: string | null; seoDescription?: string | null; updatedAt: string; variantCount?: number; categoryNames?: string[]; orderLines?: number; canDelete?: boolean };
export type AdminProductPage = { items: AdminProduct[]; total: number; page: number; pageSize: number; counts?: Record<'ACTIVE' | 'ARCHIVED' | 'DRAFT', number> };
export type BulkProductsResult = { updated: number; deleted: number; blocked: string[] };

export type ShippingRule = { id: string; name: string; states: string[]; price: string; freeAbove: string | null; freeOnly: boolean; minDays: number; maxDays: number; active: boolean; position: number };

export type AuditRow = { id: string; action: string; entity: string | null; entityId: string | null; outcome: 'SUCCESS' | 'DENIED' | 'FAILURE'; statusCode: number | null; ip: string | null; userAgent: string | null; createdAt: string; metadata: Record<string, unknown> | null; actor: { id: string; name: string; email: string } | null };
export type AuditPage = { items: AuditRow[]; total: number; page: number; pageSize: number };

export type AdminCoupon = { id: string; code: string; description: string | null; type: 'PERCENT' | 'FIXED' | 'FREE_SHIPPING'; value: string; minSubtotal: string | null; maxUses: number | null; usedCount: number; oncePerCustomer: boolean; firstOrderOnly: boolean; productIds: string[]; categoryIds: string[]; campaign: string | null; startsAt: string | null; endsAt: string | null; active: boolean; stats: { uses: number; paidOrders: number; revenue: string; discount: string } };
export type CouponCampaign = { name: string; type: AdminCoupon['type']; value: string; total: number; used: number; paidOrders: number; revenue: string; discount: string; createdAt: string; active: boolean };
export type CampaignCode = { id: string; code: string; used: boolean; active: boolean };

export type AdminCollection = { id: string; name: string; slug: string; description: string | null; active: boolean; position: number; skus: string[] };

export type Segment = 'PROSPECT' | 'NEW' | 'RECURRING' | 'VIP' | 'AT_RISK';
export type CustomerRow = { id: string; name: string; email: string; tags: string[]; marketingOptIn: boolean; createdAt: string; paidOrders: number; totalSpent: string; lastPaidAt: string | null; segment: Segment };
export type CustomerTag = { tag: string; total: number };
export type CustomerPage = { items: CustomerRow[]; total: number; page: number; pageSize: number; segments: Record<Segment, number> };
export type CustomerProfile = {
  id: string; name: string; email: string; phone: string | null; notes: string | null; tags: string[]; marketingOptIn: boolean; createdAt: string;
  addresses: { id: string }[];
  orders: { id: string; number: string; status: string; total: string; couponCode: string | null; createdAt: string }[];
  stats: { paidOrders: number; ltv: string; averageTicket: string; firstPurchaseAt: string | null; lastPurchaseAt: string | null; daysSinceLastPurchase: number | null; averageDaysBetweenOrders: number | null; segment: Segment };
  noteEntries: { id: string; authorName: string; body: string; createdAt: string }[];
  newsletter: { subscribed: boolean; since: string; unsubscribedAt: string | null } | null;
  favoriteCategories: { name: string; quantity: number }[];
  timeline: { at: string; kind: 'ORDER' | 'EMAIL' | 'CART' | 'LOYALTY' | 'COUPON' | 'NOTE' | 'SIGNUP'; title: string; detail?: string; ref?: string }[];
};

export type SalesReport = {
  from: string; to: string;
  totals: { revenue: string; orders: number; averageTicket: string; discount: string; shipping: string; buyers: number; newCustomers: number };
  previous: { from: string; to: string; revenue: string; orders: number; averageTicket: string };
  byPayment: { method: string; orders: number; revenue: string }[];
  byState: { state: string; orders: number; revenue: string }[];
  byCategory: { name: string; quantity: number; revenue: string }[];
  buyerKinds: { firstTime: number; returning: number };
  series: { day: string; revenue: string; orders: number }[];
  topProducts: { sku: string; name: string; quantity: number; revenue: string }[];
  funnel: { stage: string; count: number }[];
  cancelled: number; returned: number;
  coupons: { code: string; uses: number; discount: string }[];
};

export type LoyaltySummary = {
  balance: number; lifetime: number; valuePerPoint: number; minRedeem?: number; enabled?: boolean;
  tier: { key: string; label: string; next: { key: string; label: string; missing: number } | null };
  entries: { id: string; type: 'EARN' | 'REVERSAL' | 'REDEEM' | 'ADJUST'; points: number; note: string | null; createdAt: string }[];
};

export type AdminPage = { id: string; slug: string; title: string; body: string; published: boolean; showInFooter: boolean; position: number; seoDescription: string | null; kind?: 'PAGE' | 'POST'; excerpt?: string | null; coverImageUrl?: string | null; authorName?: string | null; publishedAt?: string | null };
export type EmailLogEntry = { id: string; template: string; toEmail: string; subject: string; status: 'SENT' | 'SIMULATED' | 'FAILED'; error: string | null; createdAt: string };
export type EmailLogPage = { items: EmailLogEntry[]; total: number; provider: 'resend' | 'simulated' };
export type AdminPromotion = { id: string; name: string; type: 'PERCENT_OFF' | 'BUY_X_PAY_Y' | 'CART_PERCENT'; value: string; buyQty: number | null; payQty: number | null; minSubtotal: string | null; skus: string[]; active: boolean; startsAt: string | null; endsAt: string | null };

export type StockMovement = { id: string; type: 'INITIAL' | 'ADJUSTMENT' | 'SALE' | 'RETURN'; delta: number; balance: number; reason: string | null; orderNumber: string | null; productName: string | null; sku: string | null; createdAt: string };
export type StockMovementPage = { items: StockMovement[]; total: number; page: number; pageSize: number };
export type StockItem = { productId: string; variantId: string | null; name: string; sku: string; variation: string; status: string; price: string; quantity: number; reserved: number; available: number };

export type MenuItemType = 'ALL' | 'CATEGORY' | 'COLLECTION' | 'BRAND' | 'PAGE' | 'LINK';
export type AdminMenuItem = { label: string; type: MenuItemType; ref?: string; children?: AdminMenuItem[] };
export type MenuOption = { id?: string; name: string; slug: string; parentId?: string | null };
export type AdminMenu = { key: 'main' | 'footer'; configured: boolean; items: AdminMenuItem[]; options: { categories: MenuOption[]; collections: MenuOption[]; brands: MenuOption[]; pages: MenuOption[] } };

export type ImportReport = { dryRun: boolean; rows: number; created: number; updated: number; failed: number; errors: { line: number; message: string }[]; products: { slug: string; name: string; action: 'create' | 'update' | 'error'; variants: number }[] };

export type AdminBanner = { id: string; imageUrl: string; mobileImageUrl: string | null; title: string | null; subtitle: string | null; ctaLabel: string | null; linkUrl: string | null; position: number; active: boolean; startsAt: string | null; endsAt: string | null };
export type Subscriber = { id: string; email: string; name: string | null; source: string; createdAt: string };
export type SubscriberPage = { items: Subscriber[]; total: number; page: number; pageSize: number };

export type BlingImportJob = { id: string; status: 'RUNNING' | 'DONE' | 'FAILED'; total: number; processed: number; created: number; updated: number; failed: number; skipped?: number; mode?: 'new' | 'update'; errors: { message: string }[]; startedAt: string; finishedAt: string | null };
export type BlingInvoiceRow = { id: string; orderId: string; orderNumber?: string; total?: string; status: 'QUEUED' | 'PROCESSING' | 'GENERATED' | 'AUTHORIZED' | 'REJECTED' | 'FAILED'; invoiceNumber: string | null; series: string | null; accessKey: string | null; rejectionReason: string | null; attempts: number; issuedAt: string | null; authorizedAt: string | null };
export type BlingStatus = { appConfigured: boolean; callbackUrl: string | null; webhookUrl: string | null; companyLinked: boolean; connected: boolean; connectedAt: string | null; lastError: string | null; automaticInvoiceEnabled: boolean; productCodeFrom?: number; stockSync: { enabled: boolean; syncedAt: string | null; error: string | null }; invoices: BlingInvoiceRow[]; import: BlingImportJob | null; orders: Partial<Record<'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED', number>> };
export type BlingSyncRow = { id: string; orderNumber: string; total: string; orderStatus: string; status: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED'; blingOrderId: string | null; blingOrderNumber: string | null; blingSituationId: string | null; blingSituationName: string | null; attempts: number; lastError: string | null; nextAttemptAt: string; sentAt: string | null };

export type BlingReconciliation = {
  checkedAt: string; truncated: boolean;
  summary: { bling: number; site: number; matched: number; inSync: number; onlyInBling: number; onlyOnSite: number; stockDiffs: number; priceDiffs: number };
  onlyInBling: { sku: string; name: string; price: number; stock: number }[];
  onlyOnSite: { sku: string; name: string }[];
  stock: { sku: string; name: string; bling: number; site: number; reserved: number }[];
  price: { sku: string; name: string; bling: number; site: number }[];
};

export type DiagnosticCheck = { id: string; area: string; title: string; status: 'ok' | 'warn' | 'fail' | 'off' | 'manual'; detail: string; hint?: string };
export type Diagnostics = { checkedAt: string; summary: { fail: number; warn: number; ok: number }; checks: DiagnosticCheck[] };
export type ShippingTestResult = { product: string; elapsedMs: number; required: boolean; options: { id: string; name: string; price: string; minDays: number; maxDays: number; free: boolean }[] };

export type OrderRefunds = { paid: string | null; remaining: string; gatewayAvailable: boolean; refunds: { id: string; amount: string; reason: string; mode: 'GATEWAY' | 'MANUAL'; status: 'PENDING' | 'DONE' | 'FAILED'; error: string | null; createdAt: string }[] };

export type AbandonedCartRow = { id: string; email: string; name: string | null; status: 'OPEN' | 'REMINDED' | 'RECOVERED' | 'OPTED_OUT'; itemCount: number; subtotal: string; items: { name: string; quantity: number; variantLabel?: string }[]; lastActivityAt: string; remindedAt: string | null; recoveredAt: string | null };
export type AbandonedCartList = { items: AbandonedCartRow[]; stats: { open: number; reminded: number; recovered: number; optedOut: number; recoveredValue: string; pendingValue: string }; delayMinutes: number; siteConfigured: boolean };

export type EmailTemplateRow = { key: string; label: string; description: string; variables: { name: string; description: string }[]; defaultSubject: string; defaultBody: string; subject: string; body: string; enabled: boolean; customized: boolean };

export type ShippingSender = { name: string; document: string; phone?: string; street: string; number: string; complement?: string; district: string; city: string; state: string };
export type OrderAutomation = { enabled: boolean; sender: Partial<ShippingSender> | null; missing: string[]; superFrete: boolean; bling: boolean };
export type CarrierStatus = { enabled: boolean; credentials: boolean; provider: string; originZip: string | null; originSource: 'store' | 'server' | null };
export type EnvironmentReport = {
  variables: { name: string; group: string; importance: 'required' | 'recommended' | 'optional'; description: string; set: boolean }[];
  unrecognized: { name: string; suggestion: string | null }[];
};

export type CampaignCounts = { total: number; sent: number; simulated: number; failed: number; pending: number };
export type EmailCampaign = { id: string; name: string; subject: string; body: string; audience: 'ALL' | 'NEWSLETTER' | 'CUSTOMERS'; segment: string | null; status: 'DRAFT' | 'SENDING' | 'SENT' | 'CANCELLED'; startedAt: string | null; finishedAt: string | null; createdAt: string; counts: CampaignCounts };
export type EmailCampaignDetail = EmailCampaign & { failures: { email: string; error: string | null }[] };

export type TrackingConfig = { ga4?: string; gtm?: string; metaPixel?: string; googleVerification?: string; homeTitle?: string; homeDescription?: string };
export type SeoAudit = {
  checks: { id: string; label: string; ok: boolean; hint: string }[];
  products: { total: number; withIssues: number; counts: { key: string; label: string; count: number }[] };
  list: { id: string; name: string; slug: string; labels: string[] }[];
};

export type WarehouseRow = { id: string; name: string; code: string; isDefault: boolean; active: boolean; units: number; skus: number };
export type WarehouseMatrix = {
  warehouses: { id: string; name: string; isDefault: boolean; active: boolean }[];
  items: { productId: string; variantId: string | null; name: string; sku: string; variation: string; quantity: number; reserved: number; byWarehouse: Record<string, number> }[];
};
export type WarehouseTransferRow = { id: string; fromWarehouse: string; toWarehouse: string; quantity: number; reason: string | null; productId: string; variantId: string | null; createdAt: string };

export type BlingCatalogItem = { id: number; sku: string | null; name: string; price: number; stock: number; hasVariations: boolean; imageUrl: string | null; inStore: boolean };
export type BlingCatalogPage = { items: BlingCatalogItem[]; page: number; pageSize: number; hasMore: boolean; codeFrom?: number; hidden?: number };

export type AutomationAction =
  | { type: 'ADD_TAG' | 'REMOVE_TAG'; tag: string }
  | { type: 'ADD_POINTS'; points: number }
  | { type: 'CREATE_COUPON'; couponType: 'PERCENT' | 'FIXED'; value: number; validDays: number; prefix: string; minSubtotal?: number }
  | { type: 'SEND_EMAIL'; subject: string; body: string; requireOptIn: boolean };
export type AutomationConditions = { minTotal?: number; maxTotal?: number; firstPurchaseOnly?: boolean; paymentMethod?: 'PIX' | 'BOLETO' | 'CREDIT_CARD' };
export type AutomationRule = {
  id: string; name: string; active: boolean; trigger: string; triggerLabel: string; conditions: AutomationConditions; delayMinutes: number;
  actions: AutomationAction[]; summary: string[]; runs: Record<'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED', number>;
};
export type AutomationPreset = { key: string; title: string; description: string };
export type AutomationRunRow = { id: string; rule: string; status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED'; runAt: string; finishedAt: string | null; attempts: number; result: string | null; customer: { name: string; email: string } | null; orderNumber: string | null };

export type LoyaltyConfig = {
  enabled: boolean; pointsPerReal: number; realPerPoint: number; minRedeem: number;
  silverFrom: number; goldFrom: number; diamondFrom: number; silverPct: number; goldPct: number; diamondPct: number; customized: boolean;
};

export type FeedStatus = {
  siteConfigured: boolean; apiConfigured: boolean; google: string; meta: string; products: number; withoutPhoto: number;
  counts: { key: string; label: string; count: number }[]; list: { id: string; name: string; labels: string[] }[];
};

export type AdminRedirect = { id: string; fromPath: string; toPath: string; hits: number; lastHitAt: string | null };

export type AdminReview = { id: string; authorName: string; rating: number; title: string | null; body: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; reply: string | null; createdAt: string; product: { id: string; name: string; slug: string } };
export type AdminReviewPage = { items: AdminReview[]; total: number; page: number; pageSize: number; counts: Record<'PENDING' | 'APPROVED' | 'REJECTED', number> };

export type FidelizeiSettings = { connected: boolean; keyHint: string | null; enabled: boolean; termsVersion: string; privacyVersion: string; termsUrl: string | null; privacyUrl: string | null; lastError: string | null; checkedAt: string | null; members: number; redemptions: Partial<Record<FidelizeiRedemptionStatus, number>> };
export type FidelizeiRedemptionStatus = 'RESERVED' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED' | 'FAILED';
export type FidelizeiRedemptionRow = { id: string; orderNumber: string | null; orderStatus: string | null; customer: string; reward: string; code: string; points: number; discount: string | null; status: FidelizeiRedemptionStatus; lastError: string | null; createdAt: string };
