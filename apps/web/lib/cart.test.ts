import { describe, expect, it } from 'vitest';
import { addItem, cartCount, cartSubtotalCents, MAX_QUANTITY, setQuantity } from './cart';

const vaso = { productId: 'p1', slug: 'vaso', name: 'Vaso', price: '0.10' };
const manta = { productId: 'p2', slug: 'manta', name: 'Manta', price: '189.90' };

describe('carrinho', () => {
  it('soma quantidade quando o produto já está no carrinho', () => {
    const items = addItem(addItem([], vaso), vaso, 2);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(3);
  });

  it('remove o item ao zerar e limita a quantidade máxima', () => {
    const items = addItem(addItem([], vaso), manta);
    expect(setQuantity(items, 'p1', 0).map(i => i.productId)).toEqual(['p2']);
    expect(setQuantity(items, 'p2', 1000)[1].quantity).toBe(MAX_QUANTITY);
  });

  it('calcula total em centavos sem erro de ponto flutuante', () => {
    const items = addItem(addItem([], vaso, 3), manta, 2);
    expect(cartCount(items)).toBe(5);
    expect(cartSubtotalCents(items)).toBe(38010);
  });
});
