import { displayName, isReviewableOrder, parseReview, summarize } from './review-rules';

describe('avaliações', () => {
  it('só pedidos pagos e não encerrados podem avaliar', () => {
    for (const ok of ['PAID', 'SHIPPED', 'DELIVERED']) expect(isReviewableOrder(ok)).toBe(true);
    for (const no of ['NEW', 'AWAITING_PAYMENT', 'CANCELLED', 'REFUNDED', 'RETURNED']) expect(isReviewableOrder(no)).toBe(false);
  });
  it('valida nota, tamanho e links', () => {
    expect(parseReview({ rating: 5, title: ' Amei ', body: 'Caimento perfeito, tecido macio.' })).toEqual({ ok: true, rating: 5, title: 'Amei', body: 'Caimento perfeito, tecido macio.' });
    expect(parseReview({ rating: 0, body: 'Caimento perfeito' })).toMatchObject({ ok: false });
    expect(parseReview({ rating: 4.5, body: 'Caimento perfeito' })).toMatchObject({ ok: false });
    expect(parseReview({ rating: 4, body: 'curto' })).toMatchObject({ ok: false });
    expect(parseReview({ rating: 4, body: 'x'.repeat(2001) })).toMatchObject({ ok: false });
    expect(parseReview({ rating: 4, body: 'Veja em https://spam.com agora mesmo' })).toMatchObject({ ok: false, error: expect.stringContaining('links') });
    expect(parseReview({ rating: 4, title: '', body: 'Muito bom   mesmo\n\n\n\nvolto a comprar' })).toMatchObject({ ok: true, title: null, body: 'Muito bom mesmo\n\nvolto a comprar' });
  });
  it('mostra só o primeiro nome e a inicial', () => {
    expect(displayName('maria APARECIDA da silva')).toBe('Maria S.');
    expect(displayName('  joana ')).toBe('Joana');
    expect(displayName('')).toBe('Cliente');
  });
  it('resume a média e a distribuição', () => {
    expect(summarize([5, 5, 4, 1])).toEqual({ count: 4, average: 3.8, distribution: { 1: 1, 2: 0, 3: 0, 4: 1, 5: 2 } });
    expect(summarize([])).toEqual({ count: 0, average: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
  });
});
