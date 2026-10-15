/** Modelos dos e-mails da loja: padrões no código, personalização por loja (assunto, mensagem e liga/desliga). */
export type Mail = { template: string; subject: string; text: string; html: string };
export type TemplateOverride = { subject: string; body: string; enabled: boolean };
export type TemplateVars = Record<string, string | undefined>;

export const VARIABLES = {
  nome: 'Primeiro nome do cliente', loja: 'Nome da loja', pedido: 'Número do pedido', total: 'Valor do pedido (ex.: R$ 99,80)',
  transportadora: 'Transportadora do envio', rastreio: 'Código de rastreio', link_rastreio: 'Link para acompanhar a entrega',
  itens: 'Lista dos itens do carrinho', link_carrinho: 'Link que devolve os itens ao carrinho',
} as const;
type VariableName = keyof typeof VARIABLES;

type Def = { label: string; description: string; event?: string; title: string; variables: VariableName[]; subject: string; body: string; required?: VariableName[] };

const ORDER_VARS: VariableName[] = ['nome', 'loja', 'pedido', 'total'];

export const TEMPLATE_DEFS = {
  'order-created': { label: 'Pedido recebido', description: 'Assim que o cliente fecha o pedido.', event: 'orders.order-created.v1', title: 'Pedido recebido', variables: ORDER_VARS, subject: 'Recebemos seu pedido {{pedido}}', body: 'Recebemos o pedido {{pedido}}.\nValor: {{total}}\n\nAssim que o pagamento for confirmado, avisaremos você.' },
  'order-paid': { label: 'Pagamento confirmado', description: 'Quando o pagamento é aprovado.', event: 'orders.order-paid.v1', title: 'Pagamento confirmado', variables: ORDER_VARS, subject: 'Pagamento confirmado – pedido {{pedido}}', body: 'O pagamento do pedido {{pedido}} foi confirmado.\n\nJá estamos separando seus itens.' },
  'order-shipped': { label: 'Pedido enviado', description: 'Quando o pedido sai para entrega, com o rastreio.', event: 'orders.order-shipped.v1', title: 'Pedido enviado', variables: [...ORDER_VARS, 'transportadora', 'rastreio', 'link_rastreio'], subject: 'Seu pedido {{pedido}} foi enviado', body: 'O pedido {{pedido}} saiu para entrega.\n\nTransportadora: {{transportadora}}\nCódigo de rastreio: {{rastreio}}\nAcompanhe em: {{link_rastreio}}' },
  'order-delivered': { label: 'Pedido entregue', description: 'Quando a entrega é confirmada.', event: 'orders.order-delivered.v1', title: 'Pedido entregue', variables: ORDER_VARS, subject: 'Pedido {{pedido}} entregue', body: 'O pedido {{pedido}} foi entregue. Esperamos que goste!' },
  'order-cancelled': { label: 'Pedido cancelado', description: 'Quando o pedido é cancelado.', event: 'orders.order-cancelled.v1', title: 'Pedido cancelado', variables: ORDER_VARS, subject: 'Pedido {{pedido}} cancelado', body: 'O pedido {{pedido}} foi cancelado.\n\nSe isso foi um engano, é só fazer um novo pedido na loja.' },
  'order-refunded': { label: 'Pedido reembolsado', description: 'Quando um reembolso é registrado.', event: 'orders.order-refunded.v1', title: 'Pedido reembolsado', variables: ORDER_VARS, subject: 'Reembolso do pedido {{pedido}}', body: 'O pedido {{pedido}} foi reembolsado.\nValor reembolsado: {{total}}\n\nO prazo para o valor aparecer na sua conta ou fatura depende do banco ou da operadora do cartão.' },
  'cart-reminder': { label: 'Lembrete de carrinho', description: 'Para quem deixou itens no carrinho. O link de “não quero receber” é sempre incluído no rodapé.', title: 'Seu carrinho está esperando', variables: ['nome', 'loja', 'itens', 'link_carrinho'], required: ['link_carrinho'], subject: '{{nome}}, seu carrinho está esperando', body: 'Você deixou estes itens no carrinho:\n\n{{itens}}\n\nFinalize sua compra: {{link_carrinho}}' },
} satisfies Record<string, Def>;

export type TemplateKey = keyof typeof TEMPLATE_DEFS;
export const isTemplateKey = (key: string): key is TemplateKey => Object.prototype.hasOwnProperty.call(TEMPLATE_DEFS, key);
export const templateKeyForEvent = (eventName: string): TemplateKey | undefined => (Object.keys(TEMPLATE_DEFS) as TemplateKey[]).find(key => (TEMPLATE_DEFS[key] as Def).event === eventName);

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const linkify = (escaped: string) => escaped.replace(/https?:\/\/[^\s<]+/g, url => `<a href="${url}" style="color:#0f172a">${url}</a>`);
const VAR = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Troca {{variáveis}}. Numa mensagem, a linha cuja variável está vazia some inteira (ex.: sem rastreio, sem a linha de rastreio). */
function fill(template: string, vars: TemplateVars, dropEmptyLines: boolean): string {
  const lines = template.split('\n').flatMap(line => {
    const used = [...line.matchAll(VAR)].map(m => m[1]);
    if (dropEmptyLines && used.some(name => !vars[name])) return [];
    return [line.replace(VAR, (_, name: string) => vars[name] ?? '')];
  });
  return lines.join('\n');
}

/** Valida o que o lojista digitou. Devolve a mensagem de erro, ou null se estiver tudo certo. */
export function validateTemplate(key: TemplateKey, subject: string, body: string): string | null {
  const def: Def = TEMPLATE_DEFS[key];
  if (!subject.trim()) return 'O assunto não pode ficar vazio.';
  if (!body.trim()) return 'A mensagem não pode ficar vazia.';
  if (subject.length > 150) return 'O assunto pode ter até 150 caracteres.';
  if (body.length > 2000) return 'A mensagem pode ter até 2000 caracteres.';
  const used = new Set([...`${subject}\n${body}`.matchAll(VAR)].map(m => m[1]));
  const unknown = [...used].filter(name => !def.variables.includes(name as VariableName));
  if (unknown.length) return `Variável(is) que não existe(m) neste e-mail: ${unknown.map(n => `{{${n}}}`).join(', ')}.`;
  const missing = (def.required ?? []).filter(name => !body.includes(`{{${name}}}`));
  if (missing.length) return `A mensagem precisa conter ${missing.map(n => `{{${n}}}`).join(', ')}.`;
  return null;
}

export type RenderOptions = { override?: TemplateOverride | null; footer?: { text: string; html: string } };

/** Monta o e-mail. Devolve null quando o lojista desligou este aviso. */
export function renderMail(key: TemplateKey, vars: TemplateVars, options: RenderOptions = {}): Mail | null {
  const def: Def = TEMPLATE_DEFS[key];
  const { override } = options;
  if (override && !override.enabled) return null;
  const subjectTemplate = override?.subject ?? def.subject;
  const bodyTemplate = override?.body ?? def.body;
  const all: TemplateVars = { ...vars, nome: vars.nome?.trim().split(/\s+/)[0] || 'cliente' };
  const subject = fill(subjectTemplate, all, false).replace(/\s+/g, ' ').trim();
  const body = fill(bodyTemplate, all, true).replace(/\n{3,}/g, '\n\n').trim();
  const loja = all.loja ?? '';
  const greeting = `Olá, ${all.nome}!`;
  const text = [greeting, '', body, '', `Equipe ${loja}`, ...(options.footer ? ['', options.footer.text] : [])].join('\n');
  const paragraphs = body.split(/\n{2,}/).map(p => `<p>${p.split('\n').map(line => linkify(escapeHtml(line))).join('<br>')}</p>`).join('');
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1e293b"><h2 style="margin:0 0 16px">${escapeHtml(def.title)}</h2><p>${escapeHtml(greeting)}</p>${paragraphs}<p style="color:#64748b">Equipe ${escapeHtml(loja)}</p>${options.footer ? `<p style="color:#94a3b8;font-size:12px">${options.footer.html}</p>` : ''}</div>`;
  return { template: key, subject, text, html };
}

/** Dados de exemplo para a pré-visualização no painel. */
export const SAMPLE_VARS: TemplateVars = {
  nome: 'Maria Silva', loja: 'Sua loja', pedido: 'SO-20261015-0001', total: 'R$ 189,90', transportadora: 'Correios', rastreio: 'BR123456789BR', link_rastreio: 'https://loja.exemplo.com.br/acompanhar',
  itens: '- 2x Vestido midi (G)\n- 1x Blusa de linho', link_carrinho: 'https://loja.exemplo.com.br/recuperar/abc123',
};
