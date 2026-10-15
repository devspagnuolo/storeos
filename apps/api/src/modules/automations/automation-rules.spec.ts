import { Action, fillTemplate, matchesConditions, orderStillValid, PRESETS, RuleInput, validateRule } from './automation-rules';

const base: RuleInput = { name: 'Teste de regra', trigger: 'orders.order-paid.v1', actions: [{ type: 'ADD_TAG', tag: 'Cliente VIP' }] };

describe('automation-rules', () => {
  it('todos os modelos prontos são válidos', () => {
    for (const preset of PRESETS) expect({ key: preset.key, erro: validateRule(preset.rule) }).toEqual({ key: preset.key, erro: null });
  });

  it('valida nome, gatilho, espera e ações', () => {
    expect(validateRule({ ...base, name: 'ab' })).toContain('nome');
    expect(validateRule({ ...base, trigger: 'x' })).toContain('disparar');
    expect(validateRule({ ...base, delayMinutes: 99_999_999 })).toContain('espera');
    expect(validateRule({ ...base, actions: [] })).toContain('pelo menos uma ação');
    expect(validateRule({ ...base, conditions: { minTotal: 10, maxTotal: 5 } })).toContain('mínimo');
    expect(validateRule({ ...base, actions: [{ type: 'ADD_POINTS', points: 0 }] })).toContain('pontos');
    expect(validateRule({ ...base, actions: [{ type: 'CREATE_COUPON', couponType: 'PERCENT', value: 150, validDays: 30, prefix: 'OI' }] })).toContain('cupom');
    expect(validateRule({ ...base, actions: [{ type: 'CREATE_COUPON', couponType: 'FIXED', value: 10, validDays: 30, prefix: 'oi!' }] })).toContain('prefixo');
    expect(validateRule({ ...base, actions: Array.from({ length: 6 }, () => ({ type: 'ADD_TAG', tag: 'a' }) as Action) })).toContain('no máximo');
  });

  it('só aceita {{cupom}} depois de criar um cupom e recusa variáveis desconhecidas', () => {
    const mail: Action = { type: 'SEND_EMAIL', requireOptIn: true, subject: 'Seu cupom', body: 'Use {{cupom}} na {{loja}} por favor' };
    expect(validateRule({ ...base, actions: [mail] })).toContain('Criar cupom');
    const coupon: Action = { type: 'CREATE_COUPON', couponType: 'PERCENT', value: 10, validDays: 30, prefix: 'OI' };
    expect(validateRule({ ...base, actions: [coupon, mail] })).toBeNull();
    expect(validateRule({ ...base, actions: [{ ...mail, body: 'Olá {{segredo}} tudo bem?' }] })).toContain('{{segredo}}');
  });

  it('avalia condições', () => {
    const facts = { total: 120, paymentMethod: 'PIX', priorPaidOrders: 1 };
    expect(matchesConditions({}, facts)).toBe(true);
    expect(matchesConditions({ minTotal: 200 }, facts)).toBe(false);
    expect(matchesConditions({ maxTotal: 100 }, facts)).toBe(false);
    expect(matchesConditions({ firstPurchaseOnly: true }, facts)).toBe(false);
    expect(matchesConditions({ firstPurchaseOnly: true }, { ...facts, priorPaidOrders: 0 })).toBe(true);
    expect(matchesConditions({ paymentMethod: 'BOLETO' }, facts)).toBe(false);
  });

  it('preenche variáveis sem deixar chaves cruas', () => {
    expect(fillTemplate('Oi {{nome}}, cupom {{ cupom }} e {{pedido}}', { nome: 'Ana', cupom: 'X1' })).toBe('Oi Ana, cupom X1 e ');
  });

  it('pedido encerrado não recebe ações de depois', () => {
    expect(orderStillValid('orders.order-delivered.v1', 'CANCELLED')).toBe(false);
    expect(orderStillValid('orders.order-delivered.v1', 'DELIVERED')).toBe(true);
    expect(orderStillValid('orders.order-cancelled.v1', 'CANCELLED')).toBe(true);
  });
});
