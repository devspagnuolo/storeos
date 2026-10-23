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
  it('lista os itens e leva ao acompanhamento do pedido; sem endereço da loja, a linha do link some', () => {
    const items = [{ name: 'Vestido midi', quantity: 2 }, { name: 'Blusa', quantity: 1 }];
    const mail = buildOrderMail('orders.order-created.v1', { ...data, items, siteUrl: 'https://loja.com.br' })!;
    expect(mail.text).toContain('- 2x Vestido midi\n- 1x Blusa');
    expect(mail.text).toContain('Acompanhe seu pedido: https://loja.com.br/acompanhar?pedido=SO-1');
    expect(mail.html).toContain('href="https://loja.com.br/acompanhar?pedido=SO-1"');
    expect(buildOrderMail('orders.order-created.v1', data)!.text).not.toContain('Acompanhe seu pedido');
  });
});
