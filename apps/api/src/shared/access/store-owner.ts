import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { Permissions } from '../auth/permissions';

const DESCRIPTIONS: Record<string, string> = {
  [Permissions.CATALOG_WRITE]: 'Criar e editar produtos e categorias',
  [Permissions.ORDERS_READ]: 'Consultar pedidos',
  [Permissions.ORDERS_WRITE]: 'Criar e alterar pedidos',
  [Permissions.SETTINGS_WRITE]: 'Configurar a loja (frete e demais ajustes)',
  [Permissions.AUDIT_READ]: 'Consultar a trilha de auditoria',
  [Permissions.MARKETING_WRITE]: 'Gerenciar cupons e promoções',
};

type Db = Pick<PrismaClient, 'permission' | 'role' | 'rolePermission' | 'store' | 'user' | 'userRole'>;

/** Garante o catálogo de permissões e o papel "owner" com todas elas. Idempotente. */
export async function ensureOwnerRole(db: Db) {
  const permissions = await Promise.all(Object.values(Permissions).map(key => db.permission.upsert({ where: { key }, create: { key, description: DESCRIPTIONS[key] }, update: { description: DESCRIPTIONS[key] } })));
  const owner = await db.role.upsert({ where: { name: 'owner' }, create: { name: 'owner', description: 'Dono da loja: acesso total' }, update: {} });
  for (const permission of permissions) {
    await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: owner.id, permissionId: permission.id } }, create: { roleId: owner.id, permissionId: permission.id }, update: {} });
  }
  return owner;
}

export type StoreOwnerInput = { storeSlug: string; storeName: string; email: string; password: string; ownerName: string };

/**
 * Cria a loja e o usuário dono, se ainda não existirem. Nunca sobrescreve a senha de um usuário existente.
 * Retorna se o usuário foi criado agora.
 */
export async function ensureStoreWithOwner(db: Db, input: StoreOwnerInput) {
  const owner = await ensureOwnerRole(db);
  const store = await db.store.upsert({ where: { slug: input.storeSlug }, create: { slug: input.storeSlug, name: input.storeName }, update: {} });
  const email = input.email.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { storeId_email: { storeId: store.id, email } } });
  const user = existing ?? await db.user.create({ data: { storeId: store.id, email, name: input.ownerName, passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }) } });
  await db.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: owner.id } }, create: { userId: user.id, roleId: owner.id }, update: {} });
  return { store, user, created: !existing };
}
