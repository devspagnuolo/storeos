/** Porta ERP. Bling é o primeiro adaptador; Tiny, Omie, Conta Azul, SAP, TOTVS e Sankhya implementam o mesmo contrato. */
export interface ErpCredentials {
  [key: string]: string;
}

export interface ErpProduct {
  externalId: string;
  sku: string;
  name: string;
  priceCents: number;
  description?: string;
  ean?: string;
  ncm?: string;
  weightGrams?: number;
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  imageUrls: string[];
  active: boolean;
  stock?: number;
  parentExternalId?: string | null;
  categoryName?: string;
  brandName?: string;
}

export interface ErpStock {
  externalId: string;
  sku: string;
  quantity: number;
}

export interface ErpCustomer {
  externalId: string;
  name: string;
  email?: string;
  phone?: string;
  document?: string;
}

export interface ErpOrderLine {
  sku: string;
  externalProductId?: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export interface ErpOrderInput {
  number: string;
  placedAt: Date;
  customer: { name: string; email: string; phone?: string; document?: string };
  shippingAddress: { street: string; number: string; complement?: string; district: string; city: string; state: string; zipCode: string };
  lines: ErpOrderLine[];
  shippingCents: number;
  discountCents: number;
  totalCents: number;
  notes?: string;
  paymentMethod: string;
}

export interface ErpOrderStatus {
  externalId: string;
  statusId?: string;
  statusName?: string;
  /** Status interno mapeado, quando conhecido. */
  mapped?: 'PICKING' | 'INVOICED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  invoice?: { number?: string; key?: string; url?: string };
  trackingCode?: string;
  carrier?: string;
}

export interface Page<T> {
  items: T[];
  nextPage: number | null;
}

export interface ErpProvider {
  readonly key: string;
  /** Troca/renova tokens; devolve credenciais atualizadas (a persistir cifradas). */
  authenticate(credentials: ErpCredentials, authorizationCode?: string): Promise<ErpCredentials>;
  healthCheck(credentials: ErpCredentials): Promise<{ ok: boolean; detail?: string }>;
  listProducts(credentials: ErpCredentials, page: number): Promise<Page<ErpProduct>>;
  listStock(credentials: ErpCredentials, externalIds: string[], warehouseId?: string): Promise<ErpStock[]>;
  listCustomers(credentials: ErpCredentials, page: number): Promise<Page<ErpCustomer>>;
  createOrder(credentials: ErpCredentials, order: ErpOrderInput, config: Record<string, unknown>): Promise<{ externalId: string; externalNumber?: string }>;
  getOrderStatus(credentials: ErpCredentials, externalId: string, config: Record<string, unknown>): Promise<ErpOrderStatus | null>;
  /** Eventos recebidos por webhook → ids de pedido/produto a reconsultar. */
  parseWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer, credentials: ErpCredentials): { valid: boolean; eventId: string; resource?: 'order' | 'product' | 'stock' | 'invoice'; externalId?: string };
}
