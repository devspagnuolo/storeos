export const orderStatusLabel: Record<string, string> = {
  NEW: 'Novo', AWAITING_PAYMENT: 'Aguardando pagamento', PAID: 'Pago', PICKING: 'Em separação', INVOICED: 'Faturado',
  SHIPPED: 'Enviado', DELIVERED: 'Entregue', CANCELLED: 'Cancelado', REFUNDED: 'Reembolsado', RETURNED: 'Devolvido',
};

export const orderStatusTone: Record<string, string> = {
  AWAITING_PAYMENT: 'bg-amber-100 text-amber-800', PAID: 'bg-emerald-100 text-emerald-800', CANCELLED: 'bg-slate-200 text-slate-600',
  SHIPPED: 'bg-sky-100 text-sky-800', DELIVERED: 'bg-emerald-100 text-emerald-800',
};

export const productStatusLabel: Record<string, string> = { DRAFT: 'Rascunho', ACTIVE: 'Ativo', ARCHIVED: 'Inativo' };

export const paymentMethodLabel: Record<string, string> = { PIX: 'PIX', BOLETO: 'Boleto', CREDIT_CARD: 'Cartão' };

export const formatDateTime = (value: string) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

export function slugify(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 160);
}

export const segmentLabel: Record<string, string> = { PROSPECT: 'Sem compras', NEW: 'Novo', RECURRING: 'Recorrente', VIP: 'VIP', AT_RISK: 'Em risco' };
export const segmentTone: Record<string, string> = {
  PROSPECT: 'bg-slate-100 text-slate-700', NEW: 'bg-violet-100 text-violet-700', RECURRING: 'bg-emerald-100 text-emerald-700', VIP: 'bg-amber-100 text-amber-800', AT_RISK: 'bg-red-100 text-red-700',
};

export const audienceLabel: Record<string, string> = { ALL: 'Newsletter e clientes que aceitaram novidades', NEWSLETTER: 'Só inscritos na newsletter', CUSTOMERS: 'Só clientes que aceitaram novidades' };
export const campaignStatus = { DRAFT: ['Rascunho', 'bg-slate-100 text-slate-700'], SENDING: ['Enviando', 'bg-amber-100 text-amber-800'], SENT: ['Enviada', 'bg-emerald-100 text-emerald-800'], CANCELLED: ['Cancelada', 'bg-slate-200 text-slate-600'] } as const;

export const automationTriggers = {
  'orders.order-created.v1': 'Pedido criado', 'orders.order-paid.v1': 'Pedido pago', 'orders.order-shipped.v1': 'Pedido enviado', 'orders.order-delivered.v1': 'Pedido entregue',
  'orders.order-cancelled.v1': 'Pedido cancelado', 'orders.order-refunded.v1': 'Pedido reembolsado', 'orders.order-returned.v1': 'Pedido devolvido',
} as const;
export const automationRunStatus = { PENDING: ['Agendada', 'bg-slate-100 text-slate-700'], RUNNING: ['Rodando', 'bg-blue-100 text-blue-800'], DONE: ['Concluída', 'bg-emerald-100 text-emerald-800'], FAILED: ['Com erro', 'bg-red-100 text-red-800'], SKIPPED: ['Pulada', 'bg-amber-100 text-amber-800'] } as const;
export function formatDelay(minutes: number) {
  if (!minutes) return 'na hora';
  if (minutes % 1440 === 0) return `${minutes / 1440} dia(s) depois`;
  if (minutes % 60 === 0) return `${minutes / 60} hora(s) depois`;
  return `${minutes} min depois`;
}
