import { classifyCustomer } from './segments';

const now = new Date('2026-10-14T00:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe('classifyCustomer', () => {
  it('classifica pelo histórico de compras pagas', () => {
    expect(classifyCustomer({ paidOrders: 0, totalSpent: 0, lastPaidAt: null }, now)).toBe('PROSPECT');
    expect(classifyCustomer({ paidOrders: 1, totalSpent: 80, lastPaidAt: daysAgo(3) }, now)).toBe('NEW');
    expect(classifyCustomer({ paidOrders: 2, totalSpent: 200, lastPaidAt: daysAgo(30) }, now)).toBe('RECURRING');
    expect(classifyCustomer({ paidOrders: 1, totalSpent: 2500, lastPaidAt: daysAgo(3) }, now)).toBe('VIP');
    expect(classifyCustomer({ paidOrders: 6, totalSpent: 300, lastPaidAt: daysAgo(3) }, now)).toBe('VIP');
  });
  it('quem parou de comprar há mais de 90 dias fica em risco, mesmo sendo VIP', () => {
    expect(classifyCustomer({ paidOrders: 8, totalSpent: 5000, lastPaidAt: daysAgo(120) }, now)).toBe('AT_RISK');
  });
});
