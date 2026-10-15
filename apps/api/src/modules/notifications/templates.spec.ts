import { buildOrderMail } from './templates';

const data = { storeName: 'Loja <Azul>', customerName: 'Maria Silva', orderNumber: 'SO-1', total: '99.80', carrier: 'Correios', trackingCode: 'BR1' };

describe('buildOrderMail', () => {
  it('monta assunto e texto de cada etapa e ignora eventos sem e-mail', () => {
    expect(buildOrderMail('orders.order-created.v1', data)).toMatchObject({ template: 'order-created', subject: 'Recebemos seu pedido SO-1' });
    expect(buildOrderMail('orders.order-created.v1', data)?.text).toContain('R$ 99,80');
    expect(buildOrderMail('orders.order-shipped.v1', data)?.text).toContain('Código de rastreio: BR1');
    expect(buildOrderMail('inventory.reserved.v1', data)).toBeNull();
  });
  it('escapa HTML vindo de nome e loja', () => {
    const mail = buildOrderMail('orders.order-paid.v1', { ...data, customerName: '<img src=x onerror=alert(1)>' })!;
    expect(mail.html).not.toContain('<img');
    expect(mail.html).toContain('Loja &lt;Azul&gt;');
  });

  it('avisa o cliente do reembolso', () => {
    expect(buildOrderMail('orders.order-refunded.v1', { ...data, total: '99.80' })).toMatchObject({ template: 'order-refunded', subject: 'Reembolso do pedido SO-1' });
  });
});
