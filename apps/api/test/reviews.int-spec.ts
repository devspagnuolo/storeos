import { NestExpressApplication } from '@nestjs/platform-express';
import { checkoutBody, cleanup, createStore, login, prisma, startApp } from './helpers';

let app: NestExpressApplication;
let api: Awaited<ReturnType<typeof startApp>>['api'];

beforeAll(async () => ({ app, api } = await startApp()));
afterAll(() => cleanup(app));

describe('avaliações de produtos', () => {
  it('só quem comprou avalia, o lojista aprova e responde, e a loja mostra média e comentários', async () => {
    const { store, product } = await createStore(10);
    const other = await createStore(10);
    const admin = await login(api, store, ['orders.write', 'catalog.write']);
    const order = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }], 'BOLETO') });
    const send = (over: Record<string, unknown> = {}) => api('/reviews', { method: 'POST', body: { storeSlug: store.slug, productSlug: 'vaso', orderNumber: order.body.number, email: 'maria@example.com', rating: 5, title: 'Amei', body: 'Peça linda, caimento perfeito e tecido macio.', ...over } });

    // Pedido ainda não pago: não avalia.
    expect((await send()).status).toBe(400);
    await api(`/orders/${order.body.number}/confirm-payment`, { method: 'POST', token: admin, body: {} });

    expect((await send({ email: 'outra@example.com' })).status).toBe(404);
    expect((await send({ orderNumber: 'SO-0000' })).status).toBe(404);
    expect((await send({ productSlug: 'rascunho' })).status).toBe(400);
    expect((await send({ rating: 6 })).status).toBe(400);
    expect((await send({ body: 'ver http://spam.com já' })).status).toBe(400);
    // Outra loja não enxerga o pedido.
    expect((await api('/reviews', { method: 'POST', body: { storeSlug: other.store.slug, productSlug: 'vaso', orderNumber: order.body.number, email: 'maria@example.com', rating: 5, body: 'Peça linda e confortável.' } })).status).toBe(404);

    const ok = await send({ email: 'MARIA@example.com' });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('PENDING');
    expect((await send()).status).toBe(409);

    // Pendente não aparece na loja.
    const publicUrl = `/reviews/public?store=${store.slug}&product=vaso`;
    expect((await api(publicUrl)).body).toMatchObject({ summary: { count: 0, average: 0 }, items: [] });

    // Permissões do painel.
    expect((await api('/reviews', { token: await login(api, store, ['orders.read']) })).status).toBe(403);
    const pending = await api('/reviews?status=PENDING', { token: admin });
    expect(pending.body).toMatchObject({ total: 1, counts: { PENDING: 1, APPROVED: 0, REJECTED: 0 } });
    const review = pending.body.items[0];
    expect(review).toMatchObject({ authorName: 'Maria S.', rating: 5, product: { slug: 'vaso' } });

    const approved = await api(`/reviews/${review.id}`, { method: 'PATCH', token: admin, body: { status: 'APPROVED', reply: 'Obrigada, Maria!' } });
    expect(approved.body).toMatchObject({ status: 'APPROVED', reply: 'Obrigada, Maria!' });
    const shown = (await api(publicUrl)).body;
    expect(shown.summary).toMatchObject({ count: 1, average: 5, distribution: { 5: 1 } });
    expect(shown.items[0]).toMatchObject({ author: 'Maria S.', title: 'Amei', reply: 'Obrigada, Maria!', verified: true });
    expect(JSON.stringify(shown)).not.toContain('example.com');
    expect((await api(`/reviews/public?store=${other.store.slug}&product=vaso`)).body.summary.count).toBe(0);

    // Rejeitar tira da loja; apagar remove; outra loja não mexe.
    await api(`/reviews/${review.id}`, { method: 'PATCH', token: admin, body: { status: 'REJECTED' } });
    expect((await api(publicUrl)).body.summary.count).toBe(0);
    expect((await api(`/reviews/${review.id}`, { method: 'PATCH', token: await login(api, other.store, ['catalog.write']), body: { status: 'APPROVED' } })).status).toBe(404);
    expect((await api(`/reviews/${review.id}`, { method: 'DELETE', token: admin })).status).toBe(204);
    expect(await prisma.productReview.count({ where: { storeId: store.id } })).toBe(0);
  });

  it('anonimizar o cliente tira o nome da avaliação', async () => {
    const { store, product } = await createStore(10);
    const admin = await login(api, store, ['orders.write', 'catalog.write']);
    const order = await api('/checkout', { method: 'POST', body: checkoutBody(store.slug, [{ productId: product.id, quantity: 1 }], 'BOLETO') });
    await api(`/orders/${order.body.number}/confirm-payment`, { method: 'POST', token: admin, body: {} });
    await api('/reviews', { method: 'POST', body: { storeSlug: store.slug, productSlug: 'vaso', orderNumber: order.body.number, email: 'maria@example.com', rating: 4, body: 'Muito bom, recomendo.' } });
    const review = await prisma.productReview.findFirstOrThrow({ where: { storeId: store.id } });
    const { customerId } = review;
    const customers = await login(api, store, ['orders.write']);
    const res = await api(`/customers/${customerId}/anonymize`, { method: 'POST', token: customers, body: {} });
    expect(res.status).toBe(200);
    expect(await prisma.productReview.findUniqueOrThrow({ where: { id: review.id } })).toMatchObject({ authorName: 'Cliente', customerId: null });
  });
});
