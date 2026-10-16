'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Category, FooterConfig, FooterLink, PageLink } from '../lib/api';
import { DEFAULT_FOOTER, formatBrazilPhone, telHref, whatsappDigits } from '../lib/footer';
import { NewsletterForm } from './newsletter-form';
import { useStoreBrand, useStoreMenus } from './store-name';

type IconName = 'whatsapp' | 'phone' | 'email' | 'pin' | 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'pinterest';

/** Ícones de traço simples, na cor do texto, para não depender de biblioteca. */
function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<IconName, React.ReactNode> = {
    whatsapp: <><path {...stroke} d="M3.5 20.5 5 16.3A8.5 8.5 0 1 1 8 19.2l-4.5 1.3Z" /><path {...stroke} d="M9 8.5c0 3.3 2.9 6.5 6.5 6.5l1-1.4-2-1-1 .8c-1-.4-2.3-1.6-2.8-2.8l.8-1-1-2L9 8.5Z" /></>,
    phone: <path {...stroke} d="M5 3.5h3.2l1.6 4-2 1.3a10.5 10.5 0 0 0 7.4 7.4l1.3-2 4 1.6V19a1.6 1.6 0 0 1-1.6 1.6A16.6 16.6 0 0 1 3.4 5.1 1.6 1.6 0 0 1 5 3.5Z" />,
    email: <><rect {...stroke} x="3" y="5" width="18" height="14" rx="2" /><path {...stroke} d="m3.5 6.5 8.5 6.5 8.5-6.5" /></>,
    pin: <><path {...stroke} d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle {...stroke} cx="12" cy="9.5" r="2.5" /></>,
    instagram: <><rect {...stroke} x="3.5" y="3.5" width="17" height="17" rx="5" /><circle {...stroke} cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" /></>,
    facebook: <path fill="currentColor" d="M13.5 21v-7.6h2.6l.4-3h-3V8.5c0-.9.3-1.5 1.5-1.5h1.6V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H7.9v3h2.6V21h3Z" />,
    tiktok: <path fill="currentColor" d="M16.6 3c.3 2.2 1.6 3.6 3.9 3.7v2.6c-1.4.1-2.6-.3-3.9-1.1v5.6c0 6.8-7.5 9-10.5 4.1-1.9-3.1-.7-8.6 5.6-8.8v2.7c-.5.1-1 .2-1.4.4-1.4.5-2.2 1.3-2 2.9.4 2.9 5.8 3.8 5.3-1.9V3h3Z" />,
    youtube: <><rect {...stroke} x="2.5" y="5.5" width="19" height="13" rx="4" /><path fill="currentColor" d="m10 9 5 3-5 3V9Z" /></>,
    pinterest: <path fill="currentColor" d="M12 2.5a9.5 9.5 0 0 0-3.5 18.3c-.1-.8-.2-2 0-2.9l1.2-5s-.3-.6-.3-1.5c0-1.4.8-2.5 1.8-2.5.9 0 1.3.7 1.3 1.5 0 .9-.6 2.2-.9 3.4-.2 1 .5 1.9 1.6 1.9 1.9 0 3.3-2 3.3-4.9 0-2.6-1.8-4.4-4.5-4.4-3 0-4.8 2.3-4.8 4.6 0 .9.3 1.9.8 2.4l.1.4-.3 1.2c0 .2-.2.3-.4.2-1.4-.7-2.2-2.7-2.2-4.3 0-3.5 2.5-6.7 7.3-6.7 3.8 0 6.8 2.7 6.8 6.4 0 3.8-2.4 6.9-5.8 6.9-1.1 0-2.2-.6-2.5-1.3l-.7 2.6c-.2.9-.9 2.1-1.4 2.8A9.5 9.5 0 1 0 12 2.5Z" />,
  };
  return <svg viewBox="0 0 24 24" className={className} aria-hidden="true">{paths[name]}</svg>;
}

/** Link interno vira <Link>; externo abre em nova aba. */
function FooterAnchor({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  if (href.startsWith('/')) return <Link href={href} className={className}>{children}</Link>;
  const external = /^https?:/i.test(href);
  return <a href={href} className={className} {...(external && { target: '_blank', rel: 'noopener noreferrer' })}>{children}</a>;
}

const SOCIAL: { key: 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'pinterest'; label: string }[] = [
  { key: 'instagram', label: 'Instagram' }, { key: 'facebook', label: 'Facebook' }, { key: 'tiktok', label: 'TikTok' }, { key: 'youtube', label: 'YouTube' }, { key: 'pinterest', label: 'Pinterest' },
];

/** Rodapé da vitrine em colunas configuradas em /painel/rodape. Fica de fora do painel e do checkout, que têm o próprio foco. */
export function Footer({ categories, pages = [], config, whatsappNumber }: { categories: Category[]; pages?: PageLink[]; config?: FooterConfig; whatsappNumber?: string | null }) {
  const { name } = useStoreBrand();
  const { footer: footerMenu } = useStoreMenus();
  const pathname = usePathname();
  if (/^\/(admin|painel|checkout)(\/|$)/.test(pathname)) return null;
  const { departments, links, contact, social, legal } = config ?? DEFAULT_FOOTER;
  const link = 'transition hover:text-brand';

  const departmentLinks: FooterLink[] = footerMenu
    ? footerMenu.map(item => ({ label: item.label, href: item.href }))
    : [{ label: 'Ver Tudo', href: '/categorias' }, ...categories.filter(category => !category.parentId).slice(0, 12).map(category => ({ label: category.name, href: `/categorias/${category.slug}` }))];
  // Páginas marcadas "mostrar no rodapé" (políticas, trocas, FAQ) vêm antes dos links que o lojista montou.
  const importantLinks = [...pages.filter(page => page.showInFooter).map(page => ({ label: page.title, href: `/p/${page.slug}` })), ...links.items]
    .filter((item, index, all) => all.findIndex(other => other.href === item.href && other.label === item.label) === index);

  const whatsapp = whatsappDigits(contact.whatsapp || whatsappNumber);
  const phoneHref = contact.phone ? telHref(contact.phone) : null;
  const contactRows = [
    whatsapp && { icon: 'whatsapp' as const, text: formatBrazilPhone(whatsapp), href: `https://wa.me/${whatsapp}` },
    contact.phone && { icon: 'phone' as const, text: contact.phone, href: phoneHref },
    contact.email && { icon: 'email' as const, text: contact.email, href: `mailto:${contact.email}` },
    (contact.address || contact.hours) && { icon: 'pin' as const, text: [contact.address, contact.hours].filter(Boolean).join('\n'), href: null },
  ].filter(Boolean) as { icon: IconName; text: string; href: string | null }[];
  const networks = SOCIAL.filter(network => social[network.key]);

  const columns = [
    departments.enabled && departmentLinks.length > 0 && (
      <nav key="departments" aria-label={departments.title}>
        <h2 className="text-xl font-bold tracking-tight">{departments.title}</h2>
        <ul className="mt-5 space-y-3 text-[15px]">{departmentLinks.map(item => <li key={`${item.href}-${item.label}`}><FooterAnchor href={item.href} className={link}>{item.label}</FooterAnchor></li>)}</ul>
      </nav>),
    links.enabled && importantLinks.length > 0 && (
      <nav key="links" aria-label={links.title}>
        <h2 className="text-xl font-bold tracking-tight">{links.title}</h2>
        <ul className="mt-5 space-y-3 text-[15px]">{importantLinks.map(item => <li key={`${item.href}-${item.label}`}><FooterAnchor href={item.href} className={link}>{item.label}</FooterAnchor></li>)}</ul>
      </nav>),
    contact.enabled && contactRows.length > 0 && (
      <div key="contact">
        <h2 className="text-xl font-bold tracking-tight">{contact.title}</h2>
        <ul className="mt-5 space-y-3 text-[15px]">
          {contactRows.map(row => (
            <li key={row.icon} className="flex gap-3">
              <Icon name={row.icon} className="mt-0.5 h-5 w-5 shrink-0" />
              {row.href ? <FooterAnchor href={row.href} className={`${link} break-all`}>{row.text}</FooterAnchor> : <span className="whitespace-pre-line">{row.text}</span>}
            </li>))}
        </ul>
      </div>),
    social.enabled && (networks.length > 0 || social.newsletter) && (
      <div key="social">
        <h2 className="text-xl font-bold tracking-tight">{social.title}</h2>
        {networks.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-3">
            {networks.map(network => (
              <li key={network.key}>
                <a href={social[network.key]} target="_blank" rel="noopener noreferrer" aria-label={`${name} no ${network.label}`} className="grid h-12 w-12 place-items-center rounded-full bg-slate-900 text-white transition hover:bg-brand dark:bg-white dark:text-slate-900">
                  <Icon name={network.key} className="h-6 w-6" />
                </a>
              </li>))}
          </ul>)}
        {social.newsletter && <div className="mt-6"><p className="text-sm font-semibold">Receba novidades e ofertas</p><NewsletterForm /></div>}
      </div>),
  ].filter(Boolean);

  const legalLine = [legal.companyName, legal.document && `CNPJ ${legal.document}`].filter(Boolean).join(' · ');
  return (
    <footer className="bg-slate-100 text-slate-900">
      {columns.length > 0 && (
        <div className={`shell grid gap-10 py-14 sm:grid-cols-2 ${columns.length >= 4 ? 'lg:grid-cols-4' : columns.length === 3 ? 'lg:grid-cols-3' : ''}`}>{columns}</div>
      )}
      <div className="border-t border-slate-200">
        <div className="shell space-y-1 py-5 text-center text-xs text-slate-500">
          <p>© {new Date().getFullYear()} {name}. Todos os direitos reservados.{legalLine && ` ${legalLine}`}</p>
          {legal.text && <p>{legal.text}</p>}
        </div>
      </div>
    </footer>
  );
}
