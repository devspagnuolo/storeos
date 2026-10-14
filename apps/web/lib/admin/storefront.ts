import type { StorefrontConfig } from '../api';

export type StorefrontState = {
  version: number;
  published: StorefrontConfig;
  draft: StorefrontConfig | null;
  publishedAt: string | null;
  publications: { id: string; version: number; createdAt: string }[];
};
export type StoreSetup = {
  storeName: string;
  completed: number;
  total: number;
  steps: { id: string; title: string; description: string; href: string; complete: boolean }[];
  payment: { paymentConfigured: boolean; webhookConfigured: boolean; callbackConfigured: boolean; confirmedPayments: number };
};
