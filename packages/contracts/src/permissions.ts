/** Catálogo de permissões do RBAC. Chaves no formato <recurso>.<ação>. */
export const PERMISSIONS = [
  'store.read',
  'store.write',
  'users.read',
  'users.write',
  'roles.write',
  'catalog.read',
  'catalog.write',
  'inventory.read',
  'inventory.write',
  'orders.read',
  'orders.write',
  'orders.refund',
  'customers.read',
  'customers.write',
  'customers.pii',
  'marketing.read',
  'marketing.write',
  'loyalty.read',
  'loyalty.write',
  'cms.read',
  'cms.write',
  'integrations.read',
  'integrations.write',
  'analytics.read',
  'ai.use',
  'audit.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PRESETS: Record<string, { description: string; permissions: readonly Permission[] }> = {
  OWNER: { description: 'Proprietário da loja — acesso total', permissions: PERMISSIONS },
  ADMIN: {
    description: 'Administrador',
    permissions: PERMISSIONS.filter((p) => p !== 'roles.write'),
  },
  CATALOG_MANAGER: {
    description: 'Gestor de catálogo e estoque',
    permissions: ['catalog.read', 'catalog.write', 'inventory.read', 'inventory.write', 'cms.read', 'ai.use'],
  },
  ORDER_OPERATOR: {
    description: 'Operação de pedidos',
    permissions: ['orders.read', 'orders.write', 'customers.read', 'inventory.read'],
  },
  SUPPORT: {
    description: 'Atendimento',
    permissions: ['orders.read', 'customers.read', 'customers.write', 'orders.write'],
  },
  MARKETING: {
    description: 'Marketing e CMS',
    permissions: ['marketing.read', 'marketing.write', 'loyalty.read', 'cms.read', 'cms.write', 'customers.read', 'analytics.read', 'ai.use'],
  },
  ANALYST: {
    description: 'Somente leitura e analytics',
    permissions: ['analytics.read', 'orders.read', 'catalog.read', 'customers.read'],
  },
};
