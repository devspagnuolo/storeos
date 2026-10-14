import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { MercadoPagoClient } from './mercado-pago.client';
import { MercadoPagoProvider, mapMercadoPagoStatus } from './mercado-pago.provider';

describe('MercadoPagoProvider', () => {
  it('cria PIX e devolve QR code e código copia e cola', async () => {
    const client = { createPixPayment: jest.fn().mockResolvedValue({ id: 42, status: 'pending', external_reference: 'SO-1', transaction_amount: 99.8, point_of_interaction: { transaction_data: { qr_code: '000201pix', qr_code_base64: 'iVBOR', ticket_url: 'https://mp/ticket' } } }) };
    const provider = new MercadoPagoProvider(client as unknown as MercadoPagoClient);
    const result = await provider.createCharge({ storeId: 's', orderNumber: 'SO-1', amount: '99.80', currency: 'BRL', method: PaymentMethod.PIX, expiresAt: new Date('2026-10-14T01:00:00Z'), customer: { name: 'Maria Silva', email: 'maria@example.com' } });
    expect(client.createPixPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 99.8, orderNumber: 'SO-1', payer: { email: 'maria@example.com', firstName: 'Maria' } }));
    expect(result).toMatchObject({ provider: 'mercadopago', transactionId: '42', status: PaymentStatus.PENDING, instructions: { pixCode: '000201pix', qrCodeBase64: 'iVBOR' } });
  });

  it.each([['approved', PaymentStatus.PAID], ['rejected', PaymentStatus.FAILED], ['cancelled', PaymentStatus.CANCELLED], ['in_process', PaymentStatus.PENDING], ['refunded', PaymentStatus.REFUNDED]])('mapeia %s', (status, expected) => {
    expect(mapMercadoPagoStatus(status)).toBe(expected);
  });
});
