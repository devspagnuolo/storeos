'use client';
import { useActionState, useState } from 'react';
import { saveFooterAction } from '../../app/admin/actions';
import type { FooterConfig, FooterLink } from '../../lib/api';

type SectionKey = 'departments' | 'links' | 'contact' | 'social';

/** Cabeçalho de cada seção: liga/desliga e o título que aparece no rodapé. */
function SectionHead({ label, hint, enabled, title, onToggle, onTitle }: { label: string; hint: string; enabled: boolean; title: string; onToggle: (value: boolean) => void; onTitle: (value: string) => void }) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-bold">{label}</h2><p className="text-sm text-slate-500">{hint}</p></div>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={enabled} onChange={event => onToggle(event.target.checked)} /> Mostrar no rodapé</label>
      </div>
      <label className="mt-4 block text-sm font-medium">Título da seção<input value={title} onChange={event => onTitle(event.target.value)} maxLength={40} className="input" disabled={!enabled} /></label>
    </>
  );
}

export function FooterForm({ footer, whatsappNumber, footerPages }: { footer: FooterConfig; whatsappNumber: string | null; footerPages: string[] }) {
  const [state, action, pending] = useActionState(saveFooterAction, {});
  const [config, setConfig] = useState<FooterConfig>(footer);
  const set = <K extends keyof FooterConfig>(key: K, patch: Partial<FooterConfig[K]>) => setConfig(current => ({ ...current, [key]: { ...current[key], ...patch } }));
  const head = (key: SectionKey) => ({ enabled: config[key].enabled, title: config[key].title, onToggle: (enabled: boolean) => set(key, { enabled }), onTitle: (title: string) => set(key, { title }) });
  const setLink = (index: number, patch: Partial<FooterLink>) => set('links', { items: config.links.items.map((item, i) => i === index ? { ...item, ...patch } : item) });
  const moveLink = (index: number, delta: number) => {
    const items = [...config.links.items];
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    set('links', { items });
  };
  const field = (key: 'contact', name: keyof FooterConfig['contact'], label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="text-sm font-medium">{label}<input value={String(config[key][name])} onChange={event => set(key, { [name]: event.target.value })} className="input" disabled={!config.contact.enabled} {...props} /></label>
  );
  const social = (name: 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'pinterest', label: string, placeholder: string) => (
    <label className="text-sm font-medium">{label}<input value={config.social[name]} onChange={event => set('social', { [name]: event.target.value })} placeholder={placeholder} className="input" disabled={!config.social.enabled} /></label>
  );

  return (
    <form action={action} className="mt-6 grid gap-6">
      <input type="hidden" name="footer" value={JSON.stringify(config)} />

      <section className="card p-6">
        <SectionHead label="Departamentos" hint="Primeira coluna: os departamentos (categorias) da loja." {...head('departments')} />
        <p className="mt-3 text-sm text-slate-500">Os links desta coluna vêm do menu do rodapé, em Aparência da loja › Menus. Sem esse menu, aparecem “Ver Tudo” e as categorias principais.</p>
      </section>

      <section className="card p-6">
        <SectionHead label="Links importantes" hint="Segunda coluna: políticas, ajuda e atalhos da conta da cliente." {...head('links')} />
        {footerPages.length > 0 && <p className="mt-3 text-sm text-slate-500">Já entram no começo desta coluna as páginas marcadas para o rodapé: <b>{footerPages.join(', ')}</b>.</p>}
        <div className="mt-4 grid gap-3">
          {config.links.items.map((item, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="text-sm font-medium">Texto<input value={item.label} onChange={event => setLink(index, { label: event.target.value })} maxLength={60} className="input" disabled={!config.links.enabled} /></label>
              <label className="text-sm font-medium">Endereço<input value={item.href} onChange={event => setLink(index, { href: event.target.value })} placeholder="/p/trocas ou https://…" className="input" disabled={!config.links.enabled} /></label>
              <div className="flex gap-1 pb-1">
                <button type="button" onClick={() => moveLink(index, -1)} disabled={index === 0} aria-label="Subir" className="button-ghost px-3 py-2 disabled:opacity-40">↑</button>
                <button type="button" onClick={() => moveLink(index, 1)} disabled={index === config.links.items.length - 1} aria-label="Descer" className="button-ghost px-3 py-2 disabled:opacity-40">↓</button>
                <button type="button" onClick={() => set('links', { items: config.links.items.filter((_, i) => i !== index) })} className="button-ghost px-3 py-2 text-red-700">Remover</button>
              </div>
            </div>))}
          {config.links.items.length < 15 && <button type="button" onClick={() => set('links', { items: [...config.links.items, { label: '', href: '' }] })} className="button-ghost w-fit text-sm" disabled={!config.links.enabled}>+ Adicionar link</button>}
          <p className="text-xs text-slate-500">Use o endereço de uma página da loja (por exemplo /p/politica-de-privacidade ou /conta) ou um site começando com https://. Links sem texto ou com endereço inválido são descartados ao salvar.</p>
        </div>
      </section>

      <section className="card p-6">
        <SectionHead label="Entre em contato" hint="Terceira coluna: como falar com a loja." {...head('contact')} />
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {field('contact', 'whatsapp', 'WhatsApp', { inputMode: 'tel', placeholder: whatsappNumber ? `Igual ao botão: ${whatsappNumber}` : '(11) 99999-8888' })}
          {field('contact', 'phone', 'Telefone', { inputMode: 'tel', placeholder: '(11) 3333-4444' })}
          {field('contact', 'email', 'E-mail', { type: 'email', placeholder: 'contato@sualoja.com.br' })}
        </div>
        {!config.contact.whatsapp && whatsappNumber && <p className="mt-2 text-xs text-slate-500">Sem WhatsApp aqui, o rodapé usa o mesmo número do botão flutuante.</p>}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Endereço da loja<textarea value={config.contact.address} onChange={event => set('contact', { address: event.target.value })} maxLength={300} rows={3} className="input" placeholder="Avenida Exemplo, 700, Loja 10 – Bairro, Cidade - UF" disabled={!config.contact.enabled} /></label>
          <label className="text-sm font-medium">Horário de atendimento<textarea value={config.contact.hours} onChange={event => set('contact', { hours: event.target.value })} maxLength={200} rows={3} className="input" placeholder="Seg. a sáb. das 9h30 às 19h. Dom. das 9h30 às 14h." disabled={!config.contact.enabled} /></label>
        </div>
      </section>

      <section className="card p-6">
        <SectionHead label="Redes sociais" hint="Quarta coluna: ícones das redes e o cadastro de novidades." {...head('social')} />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {social('instagram', 'Instagram', '@sualoja')}
          {social('facebook', 'Facebook', 'facebook.com/sualoja')}
          {social('tiktok', 'TikTok', '@sualoja')}
          {social('youtube', 'YouTube', 'youtube.com/@sualoja')}
          {social('pinterest', 'Pinterest', 'pinterest.com/sualoja')}
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={config.social.newsletter} onChange={event => set('social', { newsletter: event.target.checked })} disabled={!config.social.enabled} /> Mostrar o campo “Receba novidades e ofertas” (newsletter)</label>
      </section>

      <section className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/fidelizei.svg" alt="" width={56} height={40} className="h-10 w-14 object-contain" />
            <div><h2 className="text-lg font-bold">Fidelizei</h2><p className="text-sm text-slate-500">Selo com a logo do Fidelizei e o link do programa de fidelidade, na coluna das redes sociais.</p></div>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={config.fidelizei.enabled} onChange={event => set('fidelizei', { enabled: event.target.checked })} /> Mostrar no rodapé</label>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Link do Fidelizei<input value={config.fidelizei.url} onChange={event => set('fidelizei', { url: event.target.value })} inputMode="url" placeholder="https://fidelizaplus.com.br/…" className="input" disabled={!config.fidelizei.enabled} /></label>
          <label className="text-sm font-medium">Texto do selo<input value={config.fidelizei.text} onChange={event => set('fidelizei', { text: event.target.value })} maxLength={160} className="input" disabled={!config.fidelizei.enabled} /></label>
        </div>
        <p className="mt-2 text-xs text-slate-500">Cole o endereço da página da loja no Fidelizei. Sem link, o selo não aparece. O link abre em uma nova aba.</p>
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-bold">Linha final</h2>
        <p className="text-sm text-slate-500">Aparece embaixo de tudo, junto do “© {new Date().getFullYear()}”. Recomendado para lojas com CNPJ.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Razão social<input value={config.legal.companyName} onChange={event => set('legal', { companyName: event.target.value })} maxLength={120} className="input" /></label>
          <label className="text-sm font-medium">CNPJ<input value={config.legal.document} onChange={event => set('legal', { document: event.target.value })} maxLength={30} className="input" placeholder="00.000.000/0001-00" /></label>
          <label className="text-sm font-medium sm:col-span-2">Texto adicional (opcional)<input value={config.legal.text} onChange={event => set('legal', { text: event.target.value })} maxLength={300} className="input" placeholder="Preços e condições válidos para compras no site." /></label>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button className="button disabled:opacity-60" disabled={pending}>{pending ? 'Salvando…' : 'Salvar rodapé'}</button>
        {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
        {state.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      </div>
    </form>
  );
}
