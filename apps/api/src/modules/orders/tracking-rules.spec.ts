import { cleanTrackingCode, extractBlingTracking, statusLabel, trackingLink } from './tracking-rules';

describe('rastreio', () => {
  it('limpa o código e recusa texto livre', () => {
    expect(cleanTrackingCode(' ab 123456789 br ')).toBe('AB123456789BR');
    expect(cleanTrackingCode('<script>')).toBeNull();
    expect(cleanTrackingCode('123')).toBeNull();
    expect(cleanTrackingCode(42)).toBeNull();
  });

  it('usa o link informado só se for https e senão monta um padrão', () => {
    expect(trackingLink('AB123456789BR', 'https://transp.com/x')).toBe('https://transp.com/x');
    expect(trackingLink('AB123456789BR', 'javascript:alert(1)')).toContain('correios.com.br');
    expect(trackingLink('ZZ99-ABC', 'http://inseguro')).toContain('melhorrastreio');
    expect(trackingLink('x')).toBeNull();
  });

  it('extrai o rastreio do pedido de venda do Bling', () => {
    expect(extractBlingTracking({ data: { transporte: { volumes: [{ servico: 'PAC', codigoRastreamento: 'AB123456789BR' }] } } })).toEqual({ code: 'AB123456789BR', carrier: 'PAC' });
    expect(extractBlingTracking({ transporte: { volumes: [{ codigoRastreamento: '' }, {}], codigoRastreamento: 'XY55555', transportador: { nome: 'Jadlog' } } })).toEqual({ code: 'XY55555', carrier: 'Jadlog' });
    expect(extractBlingTracking({ data: { transporte: { volumes: [] } } })).toBeNull();
    expect(extractBlingTracking(null)).toBeNull();
  });

  it('traduz o status', () => {
    expect(statusLabel('SHIPPED')).toBe('Enviado');
    expect(statusLabel('OUTRO')).toBe('OUTRO');
  });
});
