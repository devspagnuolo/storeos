import { describe, expect, it } from 'vitest';
import { topBarMessages } from './top-bar';

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
