export type OrderMailData = { storeName: string; customerName: string; orderNumber: string; total?: string; carrier?: string; trackingCode?: string; trackingUrl?: string; siteUrl?: string };
export type Mail = { template: string; subject: string; text: string; html: string };

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'cliente';

function layout(data: OrderMailData, title: string, lines: string[]): Pick<Mail, 'text' | 'html'> {
  const greeting = `Olá, ${firstName(data.customerName)}!`;
  const text = [greeting, '', ...lines, '', `Equipe ${data.storeName}`].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1e293b"><h2 style="margin:0 0 16px">${escapeHtml(title)}</h2><p>${escapeHtml(greeting)}</p>${lines.map(line => `<p>${escapeHtml(line)}</p>`).join('')}<p style="color:#64748b">Equipe ${escapeHtml(data.storeName)}</p></div>`;
  return { text, html };
}

const money = (value?: string) => (value ? `R$ ${Number(value).toFixed(2).replace('.', ',')}` : '');

/** Textos dos e-mails de pedido. Devolve null para eventos que não geram e-mail. */
export function buildOrderMail(eventName: string, data: OrderMailData): Mail | null {
  const n = data.orderNumber;
  switch (eventName) {
    case 'orders.order-created.v1':
      return { template: 'order-created', subject: `Recebemos seu pedido ${n}`, ...layout(data, 'Pedido recebido', [`Recebemos o pedido ${n}${data.total ? ` no valor de ${money(data.total)}` : ''}.`, 'Assim que o pagamento for confirmado, avisaremos você.']) };
    case 'orders.order-paid.v1':
      return { template: 'order-paid', subject: `Pagamento confirmado – pedido ${n}`, ...layout(data, 'Pagamento confirmado', [`O pagamento do pedido ${n} foi confirmado.`, 'Já estamos separando seus itens.']) };
    case 'orders.order-shipped.v1':
      return { template: 'order-shipped', subject: `Seu pedido ${n} foi enviado`, ...layout(data, 'Pedido enviado', [`O pedido ${n} saiu para entrega${data.carrier ? ` com ${data.carrier}` : ''}.`, ...(data.trackingCode ? [`Código de rastreio: ${data.trackingCode}`] : []), ...(data.trackingUrl ? [`Acompanhe em: ${data.trackingUrl}`] : [])]) };
    case 'orders.order-delivered.v1':
      return { template: 'order-delivered', subject: `Pedido ${n} entregue`, ...layout(data, 'Pedido entregue', [`O pedido ${n} foi entregue. Esperamos que goste!`]) };
    case 'orders.order-cancelled.v1':
      return { template: 'order-cancelled', subject: `Pedido ${n} cancelado`, ...layout(data, 'Pedido cancelado', [`O pedido ${n} foi cancelado.`, 'Se isso foi um engano, é só fazer um novo pedido na loja.']) };
    case 'orders.order-refunded.v1':
      return { template: 'order-refunded', subject: `Reembolso do pedido ${n}`, ...layout(data, 'Pedido reembolsado', [`O pedido ${n} foi reembolsado${data.total ? ` (${money(data.total)})` : ''}.`, 'O prazo para o valor aparecer na sua conta ou fatura depende do banco ou da operadora do cartão.']) };
    default:
      return null;
  }
}
