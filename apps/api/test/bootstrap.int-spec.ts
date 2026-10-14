import { randomUUID } from 'node:crypto';
import { cleanup, prisma, startApp } from './helpers';

const slug = `test-${randomUUID().slice(0, 8)}`;
const env = { BOOTSTRAP_STORE_SLUG: slug, BOOTSTRAP_STORE_NAME: 'Loja Nova', BOOTSTRAP_OWNER_EMAIL: 'Dono@Example.com', BOOTSTRAP_OWNER_PASSWORD: 'senha-forte-123' };

afterAll(async () => {
  for (const key of Object.keys(env)) delete process.env[key];
});

it('cria a loja e o dono na subida, sem trocar a senha em subidas seguintes', async () => {
  Object.assign(process.env, env);
  const first = await startApp();
  const login = (password: string) => first.api('/auth/login', { method: 'POST', body: { storeSlug: slug, email: 'dono@example.com', password } });
  const session = await login('senha-forte-123');
  expect(session.status).toBe(200);
  expect(session.body.user).toMatchObject({ store: { slug, name: 'Loja Nova' }, permissions: expect.arrayContaining(['catalog.write', 'orders.read', 'orders.write']) });

  // Uma nova subida com outra senha na variável não altera a senha já criada.
  await first.app.close();
  process.env.BOOTSTRAP_OWNER_PASSWORD = 'outra-senha-456';
  const second = await startApp();
  const again = await second.api('/auth/login', { method: 'POST', body: { storeSlug: slug, email: 'dono@example.com', password: 'senha-forte-123' } });
  expect(again.status).toBe(200);
  expect(await prisma.user.count({ where: { store: { slug } } })).toBe(1);
  await cleanup(second.app);
});
