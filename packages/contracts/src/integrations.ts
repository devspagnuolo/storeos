import { z } from 'zod';

export const blingConnectSchema = z.object({
  clientId: z.string().min(5),
  clientSecret: z.string().min(5),
  /** Código de autorização devolvido pelo Bling no fluxo OAuth2. */
  authorizationCode: z.string().min(5).optional(),
});

export const blingConfigSchema = z.object({
  importProducts: z.boolean().default(true),
  importStock: z.boolean().default(true),
  importPrices: z.boolean().default(true),
  importCustomers: z.boolean().default(false),
  exportOrders: z.boolean().default(true),
  stockWarehouseId: z.string().optional(),
  salesChannelId: z.string().optional(),
  syncIntervalMinutes: z.number().int().min(5).max(1440).default(30),
});
export type BlingConfig = z.infer<typeof blingConfigSchema>;

export const runSyncSchema = z.object({
  type: z.enum(['IMPORT_PRODUCTS', 'IMPORT_STOCK', 'IMPORT_PRICES', 'IMPORT_CUSTOMERS', 'EXPORT_ORDER', 'REFRESH_ORDER_STATUS']),
  entityId: z.string().optional(),
});

export interface IntegrationView {
  id: string;
  provider: string;
  kind: string;
  status: string;
  health: string;
  healthCheckedAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  config: Record<string, unknown>;
}

export interface SyncJobView {
  id: string;
  type: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  nextRunAt: string;
  lastError: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface IntegrationLogView {
  id: string;
  direction: string;
  operation: string;
  success: boolean;
  statusCode: number | null;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
}
