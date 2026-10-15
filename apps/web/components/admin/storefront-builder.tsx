'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveStorefrontConfigAction } from '../../app/admin/actions';
import type { HomeSection, Json, SectionType, StorefrontConfig, StorefrontDesign } from '../../lib/api';
import type { StorefrontState } from '../../lib/admin/storefront';
import { defaultHomeSections, duplicateSection, FieldSpec, moveItem, newSection, SECTION_CATALOG } from '../../lib/storefront-model';
import { accentOf, contrastRatio, DEFAULT_ACCENT, PRESETS } from '../../lib/theme';
import { ImageUploader } from './image-uploader';
import { ProductPicker } from './product-picker';

type PageId = 'home' | 'category' | 'product' | 'visual';
type Doc = { sections: HomeSection[]; pages: { category: HomeSection[]; product: HomeSection[] }; design: StorefrontDesign; accentColor: string; announcementText: string };
/** Tipos aceitos nas páginas de categoria e produto (a API valida a mesma lista). */
const PAGE_TYPES: SectionType[] = ['image', 'carousel', 'text', 'products', 'benefits', 'testimonials', 'newsletter', 'video'];
const PAGE_LABEL: Record<PageId, string> = { home: 'Página inicial', category: 'Página de categoria', product: 'Página de produto', visual: 'Visual e identidade' };
const PREVIEW_PATH: Record<PageId, string> = { home: '/previa', category: '/previa/categoria', product: '/previa/produto', visual: '/previa' };
type Status = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';

/** O vídeo é salvo como provedor + id; no formulário volta a ser um link. */
function hydrate(section: HomeSection): HomeSection {
  if (section.type !== 'video' || section.props.url || !section.props.videoId) return section;
  const url = section.props.provider === 'youtube' ? `https://youtu.be/${section.props.videoId}` : `https://vimeo.com/${section.props.videoId}`;
  return { ...section, props: { ...section.props, url } };
}

function incomplete(section: HomeSection): string | null {
  const p = section.props;
  switch (section.type) {
    case 'image': return p.imageUrl ? null : 'sem imagem';
    case 'carousel': return p.slides?.some((s: Json) => s.imageUrl) ? null : 'sem imagens';
    case 'video': return p.url || p.videoId ? null : 'sem link do vídeo';
    case 'text': return p.heading || p.body ? null : 'sem texto';
    case 'benefits': return p.items?.some((i: Json) => i.title) ? null : 'sem itens';
    case 'testimonials': return p.items?.some((i: Json) => i.text) ? null : 'sem depoimentos';
    default: return null;
  }
}

function Field({ spec, value, onChange }: { spec: FieldSpec; value: Json; onChange: (value: Json) => void }) {
  const id = `f-${spec.key}-${spec.label}`.replace(/\W+/g, '-');
  if (spec.kind === 'image') {
    return <div className="grid gap-2"><span className="text-sm font-medium">{spec.label}</span>
      {value && <div className="flex items-center gap-3"><img src={value} alt="" className="h-16 w-24 rounded-lg border object-cover" /><button type="button" className="text-sm text-slate-500 underline" onClick={() => onChange(null)}>Remover imagem</button></div>}
      <ImageUploader key={value ?? 'vazio'} kind="banner" label={value ? 'Trocar imagem' : 'Enviar imagem do computador'} onUploaded={urls => onChange(urls[0])} />
      <label className="text-xs text-slate-500">Ou cole o endereço (https://…)<input type="url" className="input" value={value ?? ''} onChange={e => onChange(e.currentTarget.value || null)} /></label></div>;
  }
  if (spec.kind === 'products') return <ProductPicker label={spec.label} max={spec.max} help={spec.help} value={Array.isArray(value) ? value : []} onChange={onChange} />;
  if (spec.kind === 'list') {
    const list: Json[] = Array.isArray(value) ? value : [];
    return <fieldset className="grid gap-3 rounded-xl border p-3"><legend className="px-1 text-sm font-medium">{spec.label}</legend>
      {list.map((item, index) => <div key={index} className="grid gap-3 rounded-lg bg-slate-50 p-3">
        <div className="flex items-center justify-between"><b className="text-xs text-slate-500">{spec.itemLabel} {index + 1}</b>
          <div className="flex gap-1 text-sm">
            <button type="button" aria-label={`Subir ${spec.itemLabel} ${index + 1}`} disabled={index === 0} onClick={() => onChange(moveItem(list, index, index - 1))} className="rounded border px-2 disabled:opacity-30">↑</button>
            <button type="button" aria-label={`Descer ${spec.itemLabel} ${index + 1}`} disabled={index === list.length - 1} onClick={() => onChange(moveItem(list, index, index + 1))} className="rounded border px-2 disabled:opacity-30">↓</button>
            <button type="button" aria-label={`Remover ${spec.itemLabel} ${index + 1}`} onClick={() => onChange(list.filter((_, i) => i !== index))} className="rounded border px-2 text-red-700">✕</button></div></div>
        {spec.fields.map(sub => <Field key={sub.key} spec={sub} value={item[sub.key]} onChange={v => onChange(list.map((x, i) => (i === index ? { ...x, [sub.key]: v } : x)))} />)}
      </div>)}
      {list.length < spec.max && <button type="button" className="justify-self-start rounded-lg border px-3 py-2 text-sm font-medium" onClick={() => onChange([...list, structuredClone(spec.defaults)])}>+ Adicionar {spec.itemLabel.toLowerCase()}</button>}
    </fieldset>;
  }
  if (spec.kind === 'select') return <label className="text-sm font-medium">{spec.label}<select className="input" value={value ?? spec.options[0][0]} onChange={e => onChange(e.currentTarget.value)}>{spec.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
  if (spec.kind === 'number') return <label className="text-sm font-medium">{spec.label}<input type="number" className="input" min={spec.min} max={spec.max} value={value ?? ''} onChange={e => onChange(e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value))} /></label>;
  if (spec.kind === 'textarea') return <label htmlFor={id} className="text-sm font-medium">{spec.label}<textarea id={id} className="input" rows={3} maxLength={spec.max} value={value ?? ''} onChange={e => onChange(e.currentTarget.value)} /></label>;
  return <label htmlFor={id} className="text-sm font-medium">{spec.label}<input id={id} type={spec.kind === 'url' ? 'text' : 'text'} className="input" maxLength={spec.max} placeholder={spec.kind === 'url' ? spec.placeholder : undefined} value={value ?? ''} onChange={e => onChange(e.currentTarget.value)} />{spec.help && <span className="mt-1 block text-xs font-normal text-slate-500">{spec.help}</span>}</label>;
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div role="group" aria-label={label}><p className="text-sm font-medium">{label}</p><div className="mt-1 flex flex-wrap gap-2">{options.map(([v, l]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)} className={'rounded-lg border px-3 py-1.5 text-sm ' + (value === v ? 'border-brand bg-violet-50 font-semibold text-brand' : 'hover:bg-slate-50')}>{l}</button>)}</div></div>;
}

export function StorefrontBuilder({ state, hasBanners, institutional }: { state: StorefrontState; hasBanners: boolean; institutional: { slug: string; title: string }[] }) {
  const router = useRouter();
  const base = useMemo<StorefrontConfig>(() => state.draft ?? state.published ?? {}, [state.draft, state.published]);
  const [doc, setDoc] = useState<Doc>(() => ({
    sections: (base.home?.sections ?? defaultHomeSections(base, hasBanners)).map(hydrate),
    pages: { category: (base.pages?.category?.sections ?? []).map(hydrate), product: (base.pages?.product?.sections ?? []).map(hydrate) },
    design: base.design ?? {}, accentColor: accentOf(base), announcementText: base.announcementText ?? '',
  }));
  const [page, setPage] = useState<PageId>('home');
  const [open, setOpen] = useState<string | null>(null);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [previewKey, setPreviewKey] = useState(0);
  const [dragId, setDragId] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(Boolean(state.draft));
  const docRef = useRef(doc);
  const versionRef = useRef(state.version);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saving = useRef<Promise<void> | null>(null);
  const again = useRef(false);

  const buildConfig = useCallback((): StorefrontConfig => {
    const d = docRef.current;
    const { home, pages, design, accentColor, announcementText, ...legacy } = base;
    void home; void pages; void design; void accentColor; void announcementText;
    return { ...legacy, announcementText: d.announcementText, accentColor: d.accentColor, design: d.design, home: { sections: d.sections }, pages: { category: { sections: d.pages.category }, product: { sections: d.pages.product } } };
  }, [base]);

  const flush = useCallback((): Promise<void> => {
    if (saving.current) { again.current = true; return saving.current; }
    const run = async () => {
      setStatus('saving');
      const result = await saveStorefrontConfigAction(versionRef.current, buildConfig(), false).catch(() => ({ error: 'Sem conexão com o servidor.' } as const));
      if ('version' in result && result.version !== undefined) { versionRef.current = result.version; setHasDraft(true); setStatus('saved'); setMessage(''); setPreviewKey(k => k + 1); }
      else { again.current = false; setStatus((result as { conflict?: boolean; error?: string }).conflict ? 'conflict' : 'error'); setMessage((result as { conflict?: boolean; error?: string }).error ?? 'Não foi possível salvar.'); }
    };
    saving.current = run().finally(() => { saving.current = null; if (again.current) { again.current = false; void flush(); } });
    return saving.current;
  }, [buildConfig]);

  function update(patch: Partial<Doc> | ((d: Doc) => Partial<Doc>)) {
    setDoc(current => {
      const next = { ...current, ...(typeof patch === 'function' ? patch(current) : patch) };
      docRef.current = next;
      return next;
    });
    if (status === 'conflict') return;
    setStatus('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 1200);
  }
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (status === 'dirty' || status === 'saving' || status === 'error') e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [status]);

  const listOf = (d: Doc, id: PageId): HomeSection[] => (id === 'category' ? d.pages.category : id === 'product' ? d.pages.product : d.sections);
  const setSections = (fn: (list: HomeSection[]) => HomeSection[]) => update(d => (page === 'category' ? { pages: { ...d.pages, category: fn(d.pages.category) } } : page === 'product' ? { pages: { ...d.pages, product: fn(d.pages.product) } } : { sections: fn(d.sections) }));
  const sections = listOf(doc, page);
  const selected = sections.find(s => s.id === open) ?? null;
  const setProps = (id: string, key: string, value: Json) => setSections(list => list.map(s => (s.id === id ? { ...s, props: { ...s.props, [key]: value } } : s)));
  const setDesign = (patch: Partial<StorefrontDesign>) => update(d => ({ design: { ...d.design, ...patch } }));
  const preset = PRESETS[doc.design.preset ?? 'classico'] ?? PRESETS.classico;

  async function publish() {
    const problems = [...doc.sections, ...doc.pages.category, ...doc.pages.product].filter(s => !s.hidden && incomplete(s)).map(s => `• ${SECTION_CATALOG[s.type].label} (${incomplete(s)})`);
    const warn = problems.length ? `\n\nEstas seções estão incompletas e não vão aparecer na loja:\n${problems.join('\n')}` : '';
    if (!window.confirm('Publicar este visual para todos os clientes? A versão anterior ficará no histórico.' + warn)) return;
    clearTimeout(timer.current);
    if (saving.current) await saving.current;
    setStatus('saving');
    const result = await saveStorefrontConfigAction(versionRef.current, buildConfig(), true).catch(() => ({ error: 'Sem conexão com o servidor.' } as const));
    if ('version' in result && result.version !== undefined) {
      versionRef.current = result.version; setHasDraft(false); setStatus('saved'); setMessage('Publicado! A loja já mostra este visual. A versão anterior está no histórico.'); setPreviewKey(k => k + 1); router.refresh();
    } else { setStatus((result as { conflict?: boolean; error?: string }).conflict ? 'conflict' : 'error'); setMessage((result as { conflict?: boolean; error?: string }).error ?? 'Não foi possível publicar.'); }
  }

  const statusText: Record<Status, string> = { idle: hasDraft ? 'Rascunho salvo' : 'Sem alterações', dirty: 'Alterações não salvas…', saving: 'Salvando…', saved: hasDraft ? 'Rascunho salvo' : 'Publicado', error: 'Erro ao salvar', conflict: 'Conflito de edição' };
  const catalog = Object.entries(SECTION_CATALOG) as [SectionType, (typeof SECTION_CATALOG)[SectionType]][];
  const textBg = doc.design.textColor && doc.design.backgroundColor ? contrastRatio(doc.design.textColor, doc.design.backgroundColor) : null;
  const accentContrast = contrastRatio(doc.accentColor, '#FFFFFF');

  const allowed = page === 'home' ? catalog : catalog.filter(([type]) => PAGE_TYPES.includes(type));
  const editable = page !== 'visual';
  return <div className="grid gap-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <p role="status" aria-live="polite" className={'text-sm font-semibold ' + (status === 'error' || status === 'conflict' ? 'text-red-700' : status === 'saved' ? 'text-emerald-700' : 'text-slate-600')}>{statusText[status]}</p>
        <button type="button" className="button disabled:opacity-60" disabled={status === 'saving' || status === 'conflict'} onClick={() => void publish()}>Publicar</button>
        {message && <p role={status === 'saved' ? 'status' : 'alert'} className={'w-full text-sm ' + (status === 'saved' ? 'text-emerald-700' : 'text-red-700')}>{message}{status === 'conflict' && <> <button type="button" className="underline" onClick={() => router.refresh()}>Recarregar</button></>}</p>}
        <p className="w-full text-xs text-slate-500">As alterações são salvas sozinhas como rascunho privado. A loja só muda quando você clicar em Publicar.</p>
      </div>

    <div className="grid gap-4 xl:grid-cols-[15rem_minmax(0,1fr)_22rem]">
      <nav aria-label="Páginas e seções" className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
        <section className="card p-2"><h2 className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Páginas</h2>
          <ul className="grid gap-1">{(['home', 'category', 'product', 'visual'] as PageId[]).map(id => <li key={id}><button type="button" aria-current={page === id ? 'page' : undefined} onClick={() => { setPage(id); setOpen(null); }} className={'w-full rounded-lg px-3 py-2 text-left text-sm font-semibold ' + (page === id ? 'bg-violet-50 text-brand' : 'hover:bg-slate-50')}>{PAGE_LABEL[id]}</button></li>)}</ul>
          <h3 className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Institucionais</h3>
          <ul className="grid gap-1 text-sm">{institutional.map(p => <li key={p.slug}><a href="/painel/paginas" className="block truncate rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50" title="Editar o texto em Páginas">{p.title}</a></li>)}
            {!institutional.length && <li className="px-3 py-1.5 text-xs text-slate-500">Nenhuma ainda.</li>}
            <li><a href="/painel/paginas" className="block rounded-lg px-3 py-1.5 text-xs font-semibold text-brand hover:bg-slate-50">Gerenciar páginas →</a></li></ul>
        </section>
        {editable && <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2" aria-label={`Seções da ${PAGE_LABEL[page].toLowerCase()}`}>
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Seções</h2>
          {page !== 'home' && <p className="px-1 text-xs text-slate-500">Aparecem abaixo do conteúdo fixo da página ({page === 'category' ? 'lista de produtos' : 'detalhes do produto'}).</p>}
          <ol className="grid grid-cols-[minmax(0,1fr)] gap-2">{sections.map((section, index) => {
            const spec = SECTION_CATALOG[section.type];
            const problem = incomplete(section);
            const active = open === section.id;
            return <li key={section.id} draggable onDragStart={() => setDragId(section.id)} onDragEnd={() => setDragId(null)} onDragOver={e => e.preventDefault()}
              onDrop={() => { if (dragId) { const from = sections.findIndex(s => s.id === dragId); setSections(list => moveItem(list, from, index)); } setDragId(null); }}
              className={'card min-w-0 p-2 ' + (section.hidden ? 'opacity-60 ' : '') + (active || dragId === section.id ? 'ring-2 ring-brand' : '')}>
              <button type="button" aria-pressed={active} onClick={() => setOpen(active ? null : section.id)} className="flex w-full items-center gap-2 text-left"><span aria-hidden className="cursor-grab select-none text-slate-400" title="Arraste para reordenar">⋮⋮</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{spec.label}</span><span className="block truncate text-xs text-slate-500">{section.hidden ? 'Oculta' : problem ? `Incompleta (${problem})` : spec.description}</span></span></button>
              <div className="mt-2 flex gap-1 text-sm">
                <button type="button" aria-label={`Subir ${spec.label}`} disabled={index === 0} onClick={() => setSections(l => moveItem(l, index, index - 1))} className="rounded border px-2 py-0.5 disabled:opacity-30">↑</button>
                <button type="button" aria-label={`Descer ${spec.label}`} disabled={index === sections.length - 1} onClick={() => setSections(l => moveItem(l, index, index + 1))} className="rounded border px-2 py-0.5 disabled:opacity-30">↓</button>
                <button type="button" aria-pressed={section.hidden} aria-label={section.hidden ? `Mostrar ${spec.label}` : `Ocultar ${spec.label}`} title={section.hidden ? 'Mostrar' : 'Ocultar'} onClick={() => setSections(l => l.map(s => (s.id === section.id ? { ...s, hidden: !s.hidden } : s)))} className="rounded border px-2 py-0.5">{section.hidden ? '🙈' : '👁'}</button>
                <button type="button" aria-label={`Duplicar ${spec.label}`} title="Duplicar" disabled={sections.length >= 30} onClick={() => setSections(l => duplicateSection(l, section.id))} className="rounded border px-2 py-0.5">⧉</button>
                <button type="button" aria-label={`Excluir ${spec.label}`} title="Excluir" onClick={() => { if (window.confirm(`Excluir a seção "${spec.label}"?`)) { setSections(l => l.filter(s => s.id !== section.id)); if (active) setOpen(null); } }} className="rounded border px-2 py-0.5 text-red-700">🗑</button>
              </div>
            </li>;
          })}</ol>
          {sections.length === 0 && <p className="card p-4 text-center text-xs text-slate-500">Nenhuma seção nesta página. Adicione uma abaixo.</p>}
          <details className="card p-2" open={sections.length === 0}><summary className="cursor-pointer px-2 py-1 text-sm font-semibold">+ Adicionar seção</summary>
            <div className="mt-2 grid gap-2">{allowed.map(([type, spec]) => <button key={type} type="button" disabled={sections.length >= 30} onClick={() => { const s = newSection(type); setSections(l => [...l, s]); setOpen(s.id); }} className="rounded-xl border p-2 text-left hover:border-brand disabled:opacity-40"><span className="block text-sm font-semibold">{spec.label}</span><span className="block text-xs text-slate-500">{spec.description}</span></button>)}</div>
          </details>
        </section>}
      </nav>

    <section className="min-w-0 xl:sticky xl:top-4 xl:self-start" aria-label="Prévia">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-semibold text-slate-500">Prévia do rascunho (privada)</h2>
        <div className="flex items-center gap-3"><a href={PREVIEW_PATH[page]} target="_blank" rel="noopener" className="text-xs underline">Abrir em nova aba</a>
          <div role="group" aria-label="Tamanho da prévia" className="flex rounded-lg border bg-surface p-1">{(['desktop', 'mobile'] as const).map(d => <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)} className={'rounded px-3 py-1 text-xs ' + (device === d ? 'bg-violet-50 text-brand' : '')}>{d === 'desktop' ? 'Computador' : 'Celular'}</button>)}</div></div></div>
      <div className={'mx-auto overflow-hidden rounded-2xl border bg-surface shadow-sm ' + (device === 'mobile' ? 'w-[390px] max-w-full' : 'w-full')}>
        <iframe key={device + page} title="Prévia da loja" src={`${PREVIEW_PATH[page]}?k=${previewKey}`} className="block h-[75vh] min-h-[560px] w-full border-0" sandbox="allow-same-origin allow-scripts allow-forms" />
      </div>
      <p className="mt-2 text-xs text-slate-500">A prévia atualiza depois de cada salvamento automático. Ela mostra o rascunho; os clientes só veem o que foi publicado.</p>
    </section>

      <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start" aria-label="Configurações do elemento selecionado">
        {page === 'visual' ? <div className="grid gap-5">
        <section className="card grid gap-3 p-4"><h2 className="font-bold">Tema</h2>
          <div className="grid gap-2 sm:grid-cols-2">{Object.entries(PRESETS).map(([key, p]) => <button key={key} type="button" aria-pressed={(doc.design.preset ?? 'classico') === key} onClick={() => update(d => ({ design: { preset: key, logoUrl: d.design.logoUrl, faviconUrl: d.design.faviconUrl, backgroundColor: d.design.backgroundColor, textColor: d.design.textColor }, accentColor: p.accent ?? d.accentColor }))} className={'rounded-xl border p-3 text-left ' + ((doc.design.preset ?? 'classico') === key ? 'border-brand bg-violet-50' : 'hover:border-brand')}><span className="block text-sm font-semibold">{p.label}</span><span className="block text-xs text-slate-500">{p.description}</span></button>)}</div>
        </section>
        <section className="card grid gap-4 p-4"><h2 className="font-bold">Aparência</h2>
          <Segmented label="Tipografia" value={(doc.design.font ?? preset.design.font) as 'sans'} options={[['sans', 'Moderna'], ['serif', 'Clássica'], ['rounded', 'Arredondada']]} onChange={v => setDesign({ font: v })} />
          <Segmented label="Estilo dos cartões" value={(doc.design.cardStyle ?? 'soft') as 'soft'} options={[['soft', 'Suave'], ['flat', 'Plano'], ['outline', 'Contorno'], ['elevated', 'Sombra']]} onChange={v => setDesign({ cardStyle: v })} />
          <Segmented label="Títulos" value={(doc.design.headingFont ?? 'same') as 'same'} options={[['same', 'Igual ao texto'], ['serif', 'Serifa'], ['display', 'Impacto']]} onChange={v => setDesign({ headingFont: v })} />
          <Segmented label="Destaque da página inicial" value={(doc.design.heroTone ?? 'dark') as 'dark'} options={[['dark', 'Escuro'], ['light', 'Claro'], ['brand', 'Cor da marca']]} onChange={v => setDesign({ heroTone: v })} />
          <Segmented label="Modo da loja" value={(doc.design.mode ?? 'light') as 'light'} options={[['light', 'Claro'], ['dark', 'Escuro']]} onChange={v => setDesign({ mode: v })} />
          <Segmented label="Botões" value={(doc.design.buttonRadius ?? preset.design.buttonRadius) as 'md'} options={[['none', 'Retos'], ['sm', 'Leves'], ['md', 'Suaves'], ['full', 'Redondos']]} onChange={v => setDesign({ buttonRadius: v })} />
          <Segmented label="Largura da página" value={(doc.design.containerWidth ?? preset.design.containerWidth) as 'normal'} options={[['narrow', 'Estreita'], ['normal', 'Normal'], ['wide', 'Larga']]} onChange={v => setDesign({ containerWidth: v })} />
          <Segmented label="Espaçamento entre seções" value={(doc.design.spacing ?? preset.design.spacing) as 'normal'} options={[['compact', 'Compacto'], ['normal', 'Normal'], ['relaxed', 'Amplo']]} onChange={v => setDesign({ spacing: v })} />
        </section>
        <section className="card grid gap-4 p-4"><h2 className="font-bold">Cores</h2>
          <label className="flex items-center gap-3 text-sm font-medium">Cor de destaque (botões e links)<input aria-label="Cor de destaque" type="color" value={doc.accentColor} onChange={e => update({ accentColor: e.currentTarget.value.toUpperCase() })} className="h-10 w-14 rounded border p-1" /></label>
          {accentContrast < 3 && <p role="note" className="text-xs text-amber-800">Esta cor é clara: o texto dos botões ficará escuro automaticamente para manter a leitura.</p>}
          <label className="flex items-center gap-3 text-sm font-medium">Cor do texto<input aria-label="Cor do texto" type="color" value={doc.design.textColor ?? '#0F172A'} onChange={e => setDesign({ textColor: e.currentTarget.value.toUpperCase() })} className="h-10 w-14 rounded border p-1" />{doc.design.textColor && <button type="button" className="text-xs underline" onClick={() => setDesign({ textColor: undefined })}>padrão</button>}</label>
          <label className="flex items-center gap-3 text-sm font-medium">Cor de fundo<input aria-label="Cor de fundo" type="color" value={doc.design.backgroundColor ?? '#F8FAFC'} onChange={e => setDesign({ backgroundColor: e.currentTarget.value.toUpperCase() })} className="h-10 w-14 rounded border p-1" />{doc.design.backgroundColor && <button type="button" className="text-xs underline" onClick={() => setDesign({ backgroundColor: undefined })}>padrão</button>}</label>
          {textBg !== null && textBg < 4.5 && <p role="alert" className="text-sm text-red-700">Contraste baixo entre texto e fundo ({textBg.toFixed(1)}:1; o mínimo é 4,5:1). A publicação será recusada.</p>}
          {doc.accentColor !== DEFAULT_ACCENT && <button type="button" className="justify-self-start text-xs underline" onClick={() => update({ accentColor: DEFAULT_ACCENT })}>Voltar à cor padrão</button>}
        </section>
        <section className="card grid gap-4 p-4"><h2 className="font-bold">Identidade</h2>
          <div className="grid gap-2"><span className="text-sm font-medium">Logo</span>{doc.design.logoUrl && <div className="flex items-center gap-3"><img src={doc.design.logoUrl} alt="Logo atual" className="max-h-12 max-w-40 object-contain" /><button type="button" className="text-sm underline" onClick={() => setDesign({ logoUrl: null })}>Remover</button></div>}<ImageUploader kind="other" label="Enviar logo" onUploaded={urls => setDesign({ logoUrl: urls[0] })} /></div>
          <div className="grid gap-2"><span className="text-sm font-medium">Favicon (ícone da aba)</span>{doc.design.faviconUrl && <div className="flex items-center gap-3"><img src={doc.design.faviconUrl} alt="Favicon atual" className="h-8 w-8 object-contain" /><button type="button" className="text-sm underline" onClick={() => setDesign({ faviconUrl: null })}>Remover</button></div>}<ImageUploader kind="other" label="Enviar favicon (quadrado, 64 × 64 px ou maior)" onUploaded={urls => setDesign({ faviconUrl: urls[0] })} /></div>
        </section>
        <section className="card grid gap-3 p-4"><h2 className="font-bold">Faixa de aviso</h2>
          <label className="text-sm font-medium">Mensagem no topo da loja<input className="input" maxLength={100} placeholder="Frete grátis acima de R$ 299" value={doc.announcementText} onChange={e => update({ announcementText: e.currentTarget.value })} /></label></section>
      </div> : selected ? <div className="card grid gap-4 p-4">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Configurações</p><h2 className="text-lg font-bold">{SECTION_CATALOG[selected.type].label}</h2><p className="text-xs text-slate-500">{SECTION_CATALOG[selected.type].description}</p></div>
          {SECTION_CATALOG[selected.type].fields.length === 0 && <p className="text-sm text-slate-500">Mostra os banners cadastrados em <a className="underline" href="/painel/banners">Banners</a>. {!hasBanners && 'Ainda não há banners ativos, então esta seção não aparece.'}</p>}
          {SECTION_CATALOG[selected.type].fields.map(field => <Field key={selected.id + field.key} spec={field} value={selected.props[field.key]} onChange={v => setProps(selected.id, field.key, v)} />)}
        </div> : <p className="card p-6 text-center text-sm text-slate-500">Escolha uma seção na lista à esquerda para editar o texto, as imagens e os produtos dela.</p>}
        {editable && page === 'home' && <p className="mt-3 text-xs text-slate-500">Blog ainda não está disponível. O banner fixo de cada categoria fica em Categorias.</p>}
      </aside>
    </div>
  </div>;
}
