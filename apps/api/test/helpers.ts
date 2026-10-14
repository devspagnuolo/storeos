import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { PrismaClient, ProductStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

export const prisma = new PrismaClient();

/** Sobe a API completa numa porta livre; `customize` permite trocar providers externos por fakes. */
export async function startApp(customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = b => b) {
  process.env.THROTTLE_DISABLED = 'true';
  process.env.PAYMENT_EXPIRY_JOB = 'off';
  const moduleRef = await customize(Test.createTestingModule({ imports: [AppModule] })).compile();
  const app = configureApp(moduleRef.createNestApplication<NestExpressApplication>());
  await app.listen(0);
  const baseUrl = (await app.getUrl()).replace('[::1]', 'localhost');
  const api = async (path: string, init: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {}) => {
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      method: init.method ?? 'GET',
      headers: { 'content-type': 'application/json', ...(init.token && { authorization: `Bearer ${init.token}` }), ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : undefined };
  };
  return { app, api };
}

export async function cleanup(app: NestExpressApplication) {
  await app.close();
  try {
    await prisma.store.deleteMany({ where: { slug: { startsWith: 'test-' } } });
  } finally {
    await prisma.$disconnect();
  }
}

/** Cria uma loja isolada por teste para não depender do seed nem de outros testes. */
export async function createStore(stock = 5) {
  const slug = `test-${randomUUID().slice(0, 8)}`;
  const store = await prisma.store.create({ data: { slug, name: 'Loja Teste' } });
  const category = await prisma.category.create({ data: { storeId: store.id, slug: 'casa', name: 'Casa' } });
  const product = await prisma.product.create({ data: { storeId: store.id, slug: 'vaso', sku: 'VASO-1', name: 'Vaso azul', price: '49.90', status: ProductStatus.ACTIVE, categories: { create: { categoryId: category.id } } } });
  const draft = await prisma.product.create({ data: { storeId: store.id, slug: 'rascunho', sku: 'RASC-1', name: 'Rascunho', price: '10.00' } });
  await prisma.inventory.create({ data: { storeId: store.id, productId: product.id, quantity: stock } });
  return { store, product, draft };
}

export const checkoutBody = (storeSlug: string, items: { productId: string; quantity: number }[], paymentMethod = 'PIX') => ({
  storeSlug,
  customer: { name: 'Maria Silva', email: 'Maria@Example.com' },
  shippingAddress: { zipCode: '01310-100', street: 'Av. Paulista', number: '1000', city: 'São Paulo', state: 'SP' },
  items,
  paymentMethod,
});

/** Cria um usuário com as permissões pedidas e devolve um token de acesso. */
export async function login(api: Awaited<ReturnType<typeof startApp>>['api'], store: { id: string; slug: string }, permissions: string[]) {
  const email = `admin-${randomUUID().slice(0, 8)}@example.com`;
  const role = await prisma.role.create({ data: { name: `role-${randomUUID()}`, permissions: { create: permissions.map(key => ({ permission: { connectOrCreate: { where: { key }, create: { key } } } })) } } });
  await prisma.user.create({ data: { storeId: store.id, email, name: 'Admin', passwordHash: await argon2.hash('senha-forte-123'), roles: { create: { roleId: role.id } } } });
  const result = await api('/auth/login', { method: 'POST', body: { email, password: 'senha-forte-123', storeSlug: store.slug } });
  return result.body.accessToken as string;
}

export const inventoryOf = (productId: string) => prisma.inventory.findFirstOrThrow({ where: { productId } });
