import { renderMail, templateKeyForEvent, TemplateOverride } from './email-templates';
export type { Mail } from './email-templates';
import type { Mail } from './email-templates';

export type OrderMailData = { storeName: string; customerName: string; orderNumber: string; total?: string; carrier?: string; trackingCode?: string; trackingUrl?: string; siteUrl?: string; items?: { name: string; quantity: number }[] };

const money = (value?: string) => (value ? `R$ ${Number(value).toFixed(2).replace('.', ',')}` : undefined);
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

/** E-mails de pedido. Devolve null para eventos sem e-mail ou quando a loja desligou o aviso. */
export function buildOrderMail(eventName: string, data: OrderMailData, override?: TemplateOverride | null): Mail | null {
  const key = templateKeyForEvent(eventName);
  if (!key) return null;
  return renderMail(key, { nome: data.customerName, loja: data.storeName, pedido: data.orderNumber, total: money(data.total), transportadora: data.carrier, rastreio: data.trackingCode, link_rastreio: data.trackingUrl,
    itens: data.items?.map(i => `- ${i.quantity}x ${i.name}`).join('\n') || undefined,
    link_pedido: data.siteUrl ? `${data.siteUrl}/acompanhar?pedido=${encodeURIComponent(data.orderNumber)}` : undefined }, { override });
}

export type CartReminderData = { storeName: string; customerName: string; items: { name: string; quantity: number; variantLabel?: string }[]; recoverUrl: string; optOutUrl: string };

/** Lembrete de carrinho abandonado: lista os itens e leva direto ao carrinho de volta. O link de descadastro é sempre incluído. */
export function buildCartReminderMail(data: CartReminderData, override?: TemplateOverride | null): Mail | null {
  const itens = data.items.map(i => `- ${i.quantity}x ${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ''}`).join('\n');
  return renderMail('cart-reminder', { nome: data.customerName, loja: data.storeName, itens, link_carrinho: data.recoverUrl }, {
    override,
    footer: { text: `Não quer receber este lembrete? ${data.optOutUrl}`, html: `<a href="${escapeHtml(data.optOutUrl)}" style="color:#94a3b8">Não quero receber este lembrete</a>` },
  });
}
