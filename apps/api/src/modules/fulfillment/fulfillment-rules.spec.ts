import { parseLabelInfo, superFreteError } from '../shipping/superfrete.client';
import { packageVolume, senderProblems, superFreteService } from './fulfillment-rules';

describe('regras da automação de envio', () => {
  it('reconhece o serviço do SuperFrete pela opção do checkout ou, em pedidos antigos, pelo nome', () => {
    expect(superFreteService({ shippingOptionId: 'sf:17', shippingMethod: 'Correios Mini Envios' })).toBe(17);
    expect(superFreteService({ shippingOptionId: null, shippingMethod: 'Correios SEDEX' })).toBe(2);
    expect(superFreteService({ shippingOptionId: 'regra-uuid', shippingMethod: 'Correios SEDEX' })).toBeNull();
    expect(superFreteService({ shippingOptionId: null, shippingMethod: 'Motoboy' })).toBeNull();
  });

  it('lista o que falta no remetente', () => {
    expect(senderProblems(null, '')).toEqual(expect.arrayContaining(['nome do remetente', 'CEP de origem']));
    expect(senderProblems({ name: 'Vivi', document: '529.982.247-25', street: 'Rua A', number: '1', district: 'Centro', city: 'SP', state: 'SP' }, '01310-100')).toEqual([]);
  });

  it('junta as peças numa caixa só', () => {
    expect(packageVolume([{ quantity: 2, product: null }, { quantity: 1, product: { weightGrams: 500, widthCm: 30, heightCm: 8, lengthCm: 20 } }]))
      .toEqual({ weight: 1.1, width: 30, length: 25, height: 18 });
  });

  it('lê a situação e o rastreio da etiqueta em formatos diferentes', () => {
    expect(parseLabelInfo({ status: 'Released', tracking: 'QB1BR', price: '18.50' })).toEqual({ status: 'released', tracking: 'QB1BR', price: 18.5 });
    expect(parseLabelInfo({ data: { status: 'pending', tracking_code: '' } })).toEqual({ status: 'pending', tracking: null, price: null });
    expect(superFreteError('{"message":"Saldo insuficiente"}')).toBe('Saldo insuficiente');
  });
});
