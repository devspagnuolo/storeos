import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { MercadoPagoClient } from './mercado-pago.client';
import { MercadoPagoProvider, mapMercadoPagoStatus } from './mercado-pago.provider';

describe('MercadoPagoProvider', () => {
  it('cria PIX e devolve QR code e código copia e cola', async () => {
    const client = { createPayment: jest.fn().mockResolvedValue({ id: 42, status: 'pending', external_reference: 'SO-1', transaction_amount: 99.8, point_of_interaction: { transaction_data: { qr_code: '000201pix', qr_code_base64: 'iVBOR', ticket_url: 'https://mp/ticket' } } }) };
    const provider = new MercadoPagoProvider(client as unknown as MercadoPagoClient);
    const result = await provider.createCharge({ storeId: 's', orderNumber: 'SO-1', amount: '99.80', currency: 'BRL', method: PaymentMethod.PIX, expiresAt: new Date('2026-10-14T01:00:00Z'), customer: { name: 'Maria Silva', email: 'maria@example.com' } });
    expect(client.createPayment).toHaveBeenCalledWith(expect.objectContaining({ method: 'pix', amount: 99.8, orderNumber: 'SO-1', payer: expect.objectContaining({ email: 'maria@example.com', firstName: 'Maria' }) }));
    expect(result).toMatchObject({ provider: 'mercadopago', transactionId: '42', status: PaymentStatus.PENDING, instructions: { pixCode: '000201pix', qrCodeBase64: 'iVBOR' } });
  });

  const charge = (method: PaymentMethod, extra = {}) => ({ storeId: 's', orderNumber: 'SO-2', amount: '300.00', currency: 'BRL', method, expiresAt: new Date('2026-10-17T12:00:00Z'), customer: { name: 'Maria de Souza Lima', email: 'maria@example.com', cpf: '52998224725' }, ...extra });

  it('cobra no cartão com token e parcelas, sem guardar dados do cartão', async () => {
    const client = { createPayment: jest.fn().mockResolvedValue({ id: 7, status: 'approved', status_detail: 'accredited', external_reference: 'SO-2', transaction_amount: 300 }) };
    const provider = new MercadoPagoProvider(client as unknown as MercadoPagoClient);
    const result = await provider.createCharge(charge(PaymentMethod.CREDIT_CARD, { card: { token: 'tok_1', installments: 3, paymentMethodId: 'visa' } }));
    expect(client.createPayment).toHaveBeenCalledWith(expect.objectContaining({ method: 'card', card: { token: 'tok_1', installments: 3, paymentMethodId: 'visa' }, payer: expect.objectContaining({ firstName: 'Maria', lastName: 'de Souza Lima', cpf: '52998224725' }) }));
    expect(result).toMatchObject({ status: PaymentStatus.PAID, instructions: { installments: 3 } });
    expect(result.instructions.message).toMatch(/3x/);
  });

  it('devolve o motivo técnico da recusa do cartão', async () => {
    const client = { createPayment: jest.fn().mockResolvedValue({ id: 8, status: 'rejected', status_detail: 'cc_rejected_insufficient_amount', external_reference: 'SO-2', transaction_amount: 300 }) };
    const result = await new MercadoPagoProvider(client as unknown as MercadoPagoClient).createCharge(charge(PaymentMethod.CREDIT_CARD, { card: { token: 't', installments: 1, paymentMethodId: 'master' } }));
    expect(result).toMatchObject({ status: PaymentStatus.FAILED, declineDetail: 'cc_rejected_insufficient_amount' });
  });

  it('emite boleto com link e código de barras', async () => {
    const client = { createPayment: jest.fn().mockResolvedValue({ id: 9, status: 'pending', external_reference: 'SO-2', transaction_amount: 300, transaction_details: { external_resource_url: 'https://mp/boleto' }, barcode: { content: '23791234' } }) };
    const result = await new MercadoPagoProvider(client as unknown as MercadoPagoClient).createCharge(charge(PaymentMethod.BOLETO));
    expect(client.createPayment).toHaveBeenCalledWith(expect.objectContaining({ method: 'boleto' }));
    expect(result.instructions).toMatchObject({ ticketUrl: 'https://mp/boleto', barcode: '23791234' });
  });

  it.each([['approved', PaymentStatus.PAID], ['rejected', PaymentStatus.FAILED], ['cancelled', PaymentStatus.CANCELLED], ['in_process', PaymentStatus.PENDING], ['refunded', PaymentStatus.REFUNDED]])('mapeia %s', (status, expected) => {
    expect(mapMercadoPagoStatus(status)).toBe(expected);
  });
});
