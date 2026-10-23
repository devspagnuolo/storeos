import { describe, expect, it } from 'vitest';
import { freeShippingProgress, topBarMessages } from './top-bar';

const texts = (messages: { text: string }[]) => messages.map(message => message.text.replace(/\u00a0/g, ' '));

describe('topBarMessages', () => {
  it('mostra o frete grátis antes do aviso do lojista', () => {
    expect(texts(topBarMessages('Troca grátis em 30 dias', { from: '299.00', nationwide: true }))).toEqual(['Frete grátis acima de R$ 299,00', 'Troca grátis em 30 dias']);
  });

  it('não repete o frete quando o aviso já fala dele', () => {
    expect(texts(topBarMessages('FRETE grátis no Sul', { from: '299.00', nationwide: true }))).toEqual(['FRETE grátis no Sul']);
  });

  it('regras só regionais avisam que valem para algumas regiões', () => {
    expect(texts(topBarMessages('', { from: '149.90', nationwide: false }))).toEqual(['Frete grátis acima de R$ 149,90 para algumas regiões']);
  });

  it('sem aviso e sem frete grátis a faixa some', () => {
    expect(topBarMessages(undefined, null)).toEqual([]);
  });
});

describe('freeShippingProgress', () => {
  it('mostra quanto falta e quando já atingiu', () => {
    expect(freeShippingProgress(179.8, { from: '499.00', nationwide: true })).toEqual({ missing: 319.2, percent: 36, regional: false });
    expect(freeShippingProgress(520, { from: '499.00', nationwide: false })).toEqual({ missing: 0, percent: 100, regional: true });
  });
  it('sem regra de frete grátis não mostra nada', () => {
    expect(freeShippingProgress(100, null)).toBeNull();
    expect(freeShippingProgress(100, { from: '0', nationwide: true })).toBeNull();
  });
});
