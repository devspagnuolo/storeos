/** Regras puras das automações: gatilhos, condições, ações, validação e modelos prontos. Sem banco nem rede. */

export const TRIGGERS = {
  'orders.order-created.v1': 'Pedido criado',
  'orders.order-paid.v1': 'Pedido pago',
  'orders.order-shipped.v1': 'Pedido enviado',
  'orders.order-delivered.v1': 'Pedido entregue',
  'orders.order-cancelled.v1': 'Pedido cancelado',
  'orders.order-refunded.v1': 'Pedido reembolsado',
  'orders.order-returned.v1': 'Pedido devolvido',
} as const;
export type Trigger = keyof typeof TRIGGERS;
export const isTrigger = (value: unknown): value is Trigger => typeof value === 'string' && value in TRIGGERS;

/** Depois destes eventos o pedido não deve mais receber ações "positivas" (e-mail de agradecimento, pontos…). */
const ENDED = ['CANCELLED', 'REFUNDED', 'RETURNED'];
const ENDING_TRIGGERS: Trigger[] = ['orders.order-cancelled.v1', 'orders.order-refunded.v1', 'orders.order-returned.v1'];
export const orderStillValid = (trigger: Trigger, orderStatus: string) => ENDING_TRIGGERS.includes(trigger) || !ENDED.includes(orderStatus);

export type Conditions = { minTotal?: number; maxTotal?: number; firstPurchaseOnly?: boolean; paymentMethod?: 'PIX' | 'BOLETO' | 'CREDIT_CARD' };
export type Action =
  | { type: 'ADD_TAG'; tag: string }
  | { type: 'REMOVE_TAG'; tag: string }
  | { type: 'ADD_POINTS'; points: number }
  | { type: 'CREATE_COUPON'; couponType: 'PERCENT' | 'FIXED'; value: number; validDays: number; prefix: string; minSubtotal?: number }
  | { type: 'SEND_EMAIL'; subject: string; body: string; requireOptIn: boolean };

export const MAX_ACTIONS = 5;
export const MAX_DELAY_MINUTES = 60 * 24 * 60; // 60 dias
export const EMAIL_VARIABLES = ['nome', 'loja', 'pedido', 'total', 'cupom', 'link_loja'] as const;

export const normalizeTag = (tag: string) => tag.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 30);

export type RuleInput = { name: string; trigger: string; conditions?: Conditions; delayMinutes?: number; actions: Action[] };

/** Devolve a primeira mensagem de erro, em português, ou null se a regra é válida. */
export function validateRule(input: RuleInput): string | null {
  if (!input.name || input.name.trim().length < 3 || input.name.length > 80) return 'O nome precisa ter entre 3 e 80 caracteres.';
  if (!isTrigger(input.trigger)) return 'Escolha quando a automação deve disparar.';
  const delay = input.delayMinutes ?? 0;
  if (!Number.isInteger(delay) || delay < 0 || delay > MAX_DELAY_MINUTES) return 'O tempo de espera deve ficar entre 0 e 60 dias.';
  const c = input.conditions ?? {};
  if (c.minTotal !== undefined && !(c.minTotal >= 0)) return 'Valor mínimo inválido.';
  if (c.maxTotal !== undefined && !(c.maxTotal >= 0)) return 'Valor máximo inválido.';
  if (c.minTotal !== undefined && c.maxTotal !== undefined && c.minTotal > c.maxTotal) return 'O valor mínimo não pode passar do máximo.';
  if (!Array.isArray(input.actions) || !input.actions.length) return 'Adicione pelo menos uma ação.';
  if (input.actions.length > MAX_ACTIONS) return `Use no máximo ${MAX_ACTIONS} ações.`;
  let couponBefore = false;
  for (const [i, a] of input.actions.entries()) {
    const n = i + 1;
    if (a.type === 'ADD_TAG' || a.type === 'REMOVE_TAG') { if (!normalizeTag(a.tag ?? '')) return `Ação ${n}: informe a etiqueta.`; }
    else if (a.type === 'ADD_POINTS') { if (!Number.isInteger(a.points) || a.points < 1 || a.points > 100_000) return `Ação ${n}: pontos devem ser um número inteiro de 1 a 100.000.`; }
    else if (a.type === 'CREATE_COUPON') {
      if (a.couponType !== 'PERCENT' && a.couponType !== 'FIXED') return `Ação ${n}: escolha o tipo do cupom.`;
      if (!(a.value > 0) || (a.couponType === 'PERCENT' && a.value > 100)) return `Ação ${n}: valor do cupom inválido.`;
      if (!Number.isInteger(a.validDays) || a.validDays < 1 || a.validDays > 365) return `Ação ${n}: a validade do cupom deve ser de 1 a 365 dias.`;
      if (!/^[A-Z0-9]{2,12}$/.test(a.prefix ?? '')) return `Ação ${n}: o prefixo do cupom deve ter de 2 a 12 letras ou números (maiúsculas).`;
      couponBefore = true;
    } else if (a.type === 'SEND_EMAIL') {
      if (!a.subject || a.subject.trim().length < 3 || a.subject.length > 150) return `Ação ${n}: o assunto precisa ter de 3 a 150 caracteres.`;
      if (!a.body || a.body.trim().length < 10 || a.body.length > 8000) return `Ação ${n}: a mensagem precisa ter de 10 a 8000 caracteres.`;
      const used = [...(a.subject + a.body).matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map(m => m[1]);
      const unknown = used.find(v => !(EMAIL_VARIABLES as readonly string[]).includes(v));
      if (unknown) return `Ação ${n}: variável desconhecida {{${unknown}}}. Use ${EMAIL_VARIABLES.map(v => `{{${v}}}`).join(', ')}.`;
      if (used.includes('cupom') && !couponBefore) return `Ação ${n}: para usar {{cupom}}, coloque antes uma ação "Criar cupom".`;
    } else return `Ação ${n}: tipo desconhecido.`;
  }
  return null;
}

export type OrderFacts = { total: number; paymentMethod: string | null; priorPaidOrders: number };
export function matchesConditions(c: Conditions, facts: OrderFacts): boolean {
  if (c.minTotal !== undefined && facts.total < c.minTotal) return false;
  if (c.maxTotal !== undefined && facts.total > c.maxTotal) return false;
  if (c.firstPurchaseOnly && facts.priorPaidOrders > 0) return false;
  if (c.paymentMethod && facts.paymentMethod !== c.paymentMethod) return false;
  return true;
}

/** Troca {{variável}} pelo valor; variável sem valor some em vez de aparecer crua para o cliente. */
export function fillTemplate(template: string, vars: Partial<Record<(typeof EMAIL_VARIABLES)[number], string>>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, name: string) => (vars as Record<string, string | undefined>)[name] ?? '');
}

export function describeAction(a: Action): string {
  switch (a.type) {
    case 'ADD_TAG': return `Etiquetar cliente “${normalizeTag(a.tag)}”`;
    case 'REMOVE_TAG': return `Tirar etiqueta “${normalizeTag(a.tag)}”`;
    case 'ADD_POINTS': return `Dar ${a.points} pontos`;
    case 'CREATE_COUPON': return `Criar cupom de ${a.couponType === 'PERCENT' ? `${a.value}%` : `R$ ${a.value.toFixed(2).replace('.', ',')}`} (${a.validDays} dias)`;
    case 'SEND_EMAIL': return `Enviar e-mail “${a.subject}”`;
  }
}

export type Preset = { key: string; title: string; description: string; rule: RuleInput };
export const PRESETS: Preset[] = [
  {
    key: 'agradecimento-cupom', title: 'Agradecer a primeira compra com um cupom',
    description: 'Uma hora depois do pagamento da primeira compra, cria um cupom de 10% de uso único (válido por 30 dias) e envia por e-mail.',
    rule: {
      name: 'Agradecimento + cupom na primeira compra', trigger: 'orders.order-paid.v1', conditions: { firstPurchaseOnly: true }, delayMinutes: 60,
      actions: [
        { type: 'CREATE_COUPON', couponType: 'PERCENT', value: 10, validDays: 30, prefix: 'OBRIGADO' },
        { type: 'SEND_EMAIL', requireOptIn: true, subject: 'Obrigada pela compra, {{nome}}! Um presente para a próxima', body: 'Oi, {{nome}}!\n\nQue alegria ter você na {{loja}}. Para agradecer o pedido {{pedido}}, preparamos um cupom de 10% para a sua próxima compra:\n\n{{cupom}}\n\nÉ só usar no carrinho em {{link_loja}}. Vale por 30 dias.\n\nUm abraço,\nEquipe {{loja}}' },
      ],
    },
  },
  {
    key: 'pedir-avaliacao', title: 'Pedir a opinião 7 dias depois da entrega',
    description: 'Uma semana após a entrega, envia um e-mail perguntando como foi a compra.',
    rule: {
      name: 'Pedir avaliação após a entrega', trigger: 'orders.order-delivered.v1', conditions: {}, delayMinutes: 7 * 24 * 60,
      actions: [{ type: 'SEND_EMAIL', requireOptIn: false, subject: 'Como foi sua compra, {{nome}}?', body: 'Oi, {{nome}}!\n\nSeu pedido {{pedido}} já chegou. Gostou? Gostou? Conte como foi na página do produto, em {{link_loja}}: é só clicar em “Avaliar este produto” e usar o número do pedido. Sua opinião ajuda muito outras clientes e a {{loja}} a melhorar.\n\nObrigada!\nEquipe {{loja}}' }],
    },
  },
  {
    key: 'cliente-grande', title: 'Marcar clientes de compras grandes',
    description: 'Quando um pedido de R$ 500 ou mais é pago, etiqueta o cliente como “compra-grande” para campanhas e filtros.',
    rule: { name: 'Etiquetar compras acima de R$ 500', trigger: 'orders.order-paid.v1', conditions: { minTotal: 500 }, delayMinutes: 0, actions: [{ type: 'ADD_TAG', tag: 'compra-grande' }] },
  },
  {
    key: 'pontos-primeira-compra', title: 'Bônus de 100 pontos na primeira compra',
    description: 'Quando a primeira compra é paga, soma 100 pontos de fidelidade ao cliente.',
    rule: { name: 'Bônus de pontos na primeira compra', trigger: 'orders.order-paid.v1', conditions: { firstPurchaseOnly: true }, delayMinutes: 0, actions: [{ type: 'ADD_POINTS', points: 100 }] },
  },
];
