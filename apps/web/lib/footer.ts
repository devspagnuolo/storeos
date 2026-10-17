import type { FooterConfig } from './api';

/** Mesmo padrão da API: vale enquanto a loja não configurou o rodapé (ou a API ainda não manda o campo). */
export const DEFAULT_FOOTER: FooterConfig = {
  departments: { enabled: true, title: 'Departamentos' },
  links: { enabled: true, title: 'Importante', items: [{ label: 'Meus dados', href: '/conta' }, { label: 'Meus pedidos', href: '/conta' }, { label: 'Acompanhar pedido', href: '/acompanhar' }] },
  contact: { enabled: true, title: 'Entre em contato', whatsapp: '', phone: '', email: '', address: '', hours: '' },
  social: { enabled: true, title: 'Permaneça conectado', instagram: '', facebook: '', tiktok: '', youtube: '', pinterest: '', newsletter: true },
  legal: { companyName: '', document: '', text: '' },
  fidelizei: { enabled: true, url: '', text: 'Junte pontos nas suas compras e troque por benefícios.' },
};

/** Número do WhatsApp com DDI para o wa.me: quem digitou só DDD + número ganha o 55 do Brasil. */
export function whatsappDigits(value: string | null | undefined) {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length <= 11 ? `55${digits}` : digits;
}

/** "5511993482824" → "(11) 99348-2824", do jeito que o cliente lê. */
export function formatBrazilPhone(value: string | null | undefined) {
  const digits = (value ?? '').replace(/\D/g, '');
  const local = digits.length > 11 && digits.startsWith('55') ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return value ?? '';
}

/** Link "tel:" a partir do telefone digitado no painel. */
export function telHref(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return `tel:+${digits.length <= 11 ? `55${digits}` : digits}`;
}
