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
  open: boolean;
  launchBlockers: string[];
  completed: number;
  total: number;
  ready: boolean;
  pendingRequired: string[];
  steps: { id: string; title: string; description: string; href: string; complete: boolean; level: 'required' | 'recommended' }[];
  payment: { paymentConfigured: boolean; webhookConfigured: boolean; callbackConfigured: boolean; confirmedPayments: number };
};

/** Quem desenha cada página da loja (GET /themes/status). */
export type ThemeStatus = {
  publishEnabled: boolean;
  active: { installationId: string; name: string; version: string; live: boolean } | null;
  templates: { pageType: 'home' | 'category' | 'product' | 'search' | 'cart' | 'not-found' | 'visual'; controlledBy: 'editor' | 'engine' }[];
};
