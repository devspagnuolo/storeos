import { money } from '../../shared/money/money';
import { shippingOptions } from './shipping-options';

const rule = (over: Partial<Parameters<typeof shippingOptions>[0][number]> = {}) => ({ id: 'r', name: 'PAC', states: [], price: money('19.90'), freeAbove: null, minDays: 3, maxDays: 8, ...over });

describe('shippingOptions', () => {
  it('filtra por UF e trata lista vazia como Brasil inteiro', () => {
    const rules = [rule({ id: 'br' }), rule({ id: 'sp', states: ['SP'] }), rule({ id: 'sul', states: ['PR', 'SC', 'RS'] })];
    expect(shippingOptions(rules, 'SP', money(10)).map(o => o.id)).toEqual(['br', 'sp']);
    expect(shippingOptions(rules, 'RS', money(10)).map(o => o.id)).toEqual(['br', 'sul']);
  });

  it('zera o frete a partir do valor de frete grátis', () => {
    const rules = [rule({ freeAbove: money(200) })];
    expect(shippingOptions(rules, 'SP', money('199.99'))[0]).toMatchObject({ free: false, price: money('19.90') });
    expect(shippingOptions(rules, 'SP', money(200))[0]).toMatchObject({ free: true, price: money(0) });
  });
});

describe('frete grátis exclusivo', () => {
  it('só oferece a regra quando o frete grátis é atingido', () => {
    const rules = [rule({ id: 'gratis', price: money(0), freeAbove: money(350), freeOnly: true }), rule({ id: 'pac' })];
    expect(shippingOptions(rules, 'SP', money('349.99')).map(o => o.id)).toEqual(['pac']);
    expect(shippingOptions(rules, 'SP', money(350)).map(o => o.id)).toEqual(['gratis', 'pac']);
  });
});
