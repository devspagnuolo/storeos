export type FooterLink = { label: string; href: string };

/** Rodapé da vitrine em quatro colunas, cada uma ligada ou desligada pelo lojista, e uma linha final com os dados legais. */
export type FooterConfig = {
  departments: { enabled: boolean; title: string };
  links: { enabled: boolean; title: string; items: FooterLink[] };
  contact: { enabled: boolean; title: string; whatsapp: string; phone: string; email: string; address: string; hours: string };
  social: { enabled: boolean; title: string; instagram: string; facebook: string; tiktok: string; youtube: string; pinterest: string; newsletter: boolean };
  legal: { companyName: string; document: string; text: string };
  /** Selo do programa de fidelidade Fidelizei com o link da loja na plataforma; só aparece com link preenchido. */
  fidelizei: { enabled: boolean; url: string; text: string };
};

export const SOCIAL_NETWORKS = ['instagram', 'facebook', 'tiktok', 'youtube', 'pinterest'] as const;

export const DEFAULT_FOOTER: FooterConfig = {
  departments: { enabled: true, title: 'Departamentos' },
  links: { enabled: true, title: 'Importante', items: [{ label: 'Meus dados', href: '/conta' }, { label: 'Meus pedidos', href: '/conta' }, { label: 'Acompanhar pedido', href: '/acompanhar' }] },
  contact: { enabled: true, title: 'Entre em contato', whatsapp: '', phone: '', email: '', address: '', hours: '' },
  social: { enabled: true, title: 'Permaneça conectado', instagram: '', facebook: '', tiktok: '', youtube: '', pinterest: '', newsletter: true },
  legal: { companyName: '', document: '', text: '' },
  fidelizei: { enabled: true, url: '', text: 'Junte pontos nas suas compras e troque por benefícios.' },
};

const MAX_LINKS = 15;

const text = (value: unknown, max: number, fallback = '') => typeof value === 'string' ? value.trim().slice(0, max) : fallback;
const flag = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback;
const obj = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Link do rodapé: caminho da própria loja ("/p/trocas"), endereço https, e-mail ou telefone. Nada de javascript: ou //outro-site. */
export function safeHref(value: unknown): string | null {
  const href = text(value, 300);
  if (!href) return null;
  if (href.startsWith('/') && !href.startsWith('//') && !href.includes('\\')) return href;
  if (/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(href)) return href;
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(href)) return href;
  if (/^tel:\+?[\d\s()-]{8,20}$/i.test(href)) return href;
  return null;
}

/** Perfil de rede social: só https. Aceita "@usuario" do Instagram e do TikTok e monta o endereço. */
export function socialUrl(network: (typeof SOCIAL_NETWORKS)[number], value: unknown): string {
  const raw = text(value, 300);
  if (!raw) return '';
  const handle = raw.match(/^@([\w.]{1,60})$/);
  if (handle && network === 'instagram') return `https://instagram.com/${handle[1]}`;
  if (handle && network === 'tiktok') return `https://www.tiktok.com/@${handle[1]}`;
  return httpsUrl(raw);
}

/** Endereço web, sempre https (redes sociais e link do Fidelizei); aceita que o lojista cole sem o "https://". */
export function httpsUrl(value: unknown): string {
  const raw = text(value, 300);
  if (!raw) return '';
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(url) ? url.replace(/^http:/i, 'https:') : '';
}

/** Limpa o que chega do painel e o que está salvo (JSON livre): campo inválido volta ao padrão, link inválido é descartado. */
export function readFooterConfig(value: unknown): FooterConfig {
  const input = obj(value);
  const departments = obj(input.departments);
  const links = obj(input.links);
  const contact = obj(input.contact);
  const social = obj(input.social);
  const legal = obj(input.legal);
  const fidelizei = obj(input.fidelizei);
  const d = DEFAULT_FOOTER;
  const items = Array.isArray(links.items)
    ? links.items.map(item => {
      const label = text(obj(item).label, 60);
      const href = safeHref(obj(item).href);
      return label && href ? { label, href } : null;
    }).filter((item): item is FooterLink => item !== null).slice(0, MAX_LINKS)
    : d.links.items;
  return {
    departments: { enabled: flag(departments.enabled, true), title: text(departments.title, 40) || d.departments.title },
    links: { enabled: flag(links.enabled, true), title: text(links.title, 40) || d.links.title, items },
    contact: {
      enabled: flag(contact.enabled, true),
      title: text(contact.title, 40) || d.contact.title,
      whatsapp: text(contact.whatsapp, 20).replace(/\D/g, ''),
      phone: text(contact.phone, 30),
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(contact.email, 120)) ? text(contact.email, 120).toLowerCase() : '',
      address: text(contact.address, 300),
      hours: text(contact.hours, 200),
    },
    social: {
      enabled: flag(social.enabled, true),
      title: text(social.title, 40) || d.social.title,
      ...Object.fromEntries(SOCIAL_NETWORKS.map(network => [network, socialUrl(network, social[network])])) as Record<(typeof SOCIAL_NETWORKS)[number], string>,
      newsletter: flag(social.newsletter, true),
    },
    legal: { companyName: text(legal.companyName, 120), document: text(legal.document, 30), text: text(legal.text, 300) },
    fidelizei: { enabled: flag(fidelizei.enabled, true), url: httpsUrl(fidelizei.url), text: typeof fidelizei.text === 'string' ? text(fidelizei.text, 160) : d.fidelizei.text },
  };
}
