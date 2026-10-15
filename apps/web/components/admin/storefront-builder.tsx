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

type PageId = 'home' | 'category' | 'product' | 'visual' | 'brand';
type Doc = { sections: HomeSection[]; pages: { category: HomeSection[]; product: HomeSection[] }; design: StorefrontDesign; accentColor: string; announcementText: string };
/** Tipos aceitos nas páginas de categoria e produto (a API valida a mesma lista). */
const PAGE_TYPES: SectionType[] = ['image', 'carousel', 'text', 'products', 'benefits', 'testimonials', 'newsletter', 'video'];
const PAGE_LABEL: Record<PageId, string> = { home: 'Página inicial', category: 'Página de categoria', product: 'Página de produto', visual: 'Cores e estilo', brand: 'Logo e identidade' };
const PAGE_TAB: Record<PageId, string> = { home: 'Início', category: 'Categoria', product: 'Produto', visual: 'Visual', brand: 'Marca' };
const PAGE_HELP: Record<PageId, string> = {
  home: 'Monte a vitrine da loja: adicione, mova, oculte ou remova seções. Clique em uma seção para editar.',
  category: 'Seções que aparecem abaixo da lista de produtos de cada categoria.',
  product: 'Seções que aparecem abaixo dos detalhes de cada produto.',
  visual: 'Cores, tipografia, cantos e estilo valem para a loja inteira.',
  brand: 'Logo, ícone da aba do navegador e a faixa de aviso no topo da loja.',
};
const PAGES: PageId[] = ['home', 'category', 'product', 'visual', 'brand'];
const PREVIEW_PATH: Record<PageId, string> = { home: '/previa', category: '/previa/categoria', product: '/previa/produto', visual: '/previa', brand: '/previa' };
type Status = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';

const ICON = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  bag: 'M6 7h12l1 14H5zM9 7a3 3 0 0 1 6 0',
  palette: 'M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.2-1.6-.5-1.2.3-2.4 1.6-2.4H17a4 4 0 0 0 4-4c0-5-4-10-9-10zM7.5 11.5h.01M10 7.5h.01M15 8h.01',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  image: 'M3 5h18v14H3zM8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 19',
  slides: 'M6 5h12v14H6zM2 7v10M22 7v10',
  text: 'M4 6h16M4 12h16M4 18h10',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  chat: 'M21 12a8 8 0 0 1-11.8 7L4 20l1.2-4.4A8 8 0 1 1 21 12z',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  video: 'M4 5h16v14H4zM10 9l5 3-5 3z',
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M19 12l-7 7-7-7',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  copy: 'M8 8h12v12H8zM16 8V4H4v12h4',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
  plus: 'M12 5v14M5 12h14',
  chevron: 'M9 6l6 6-6 6',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  phone: 'M7 2h10v20H7zM11 18h2',
  pencil: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
} as const;
const PAGE_ICON: Record<PageId, keyof typeof ICON> = { home: 'home', category: 'grid', product: 'bag', visual: 'palette', brand: 'star' };
const SECTION_ICON: Record<SectionType, keyof typeof ICON> = { banners: 'slides', hero: 'star', image: 'image', carousel: 'slides', text: 'text', categories: 'grid', products: 'bag', benefits: 'shield', testimonials: 'chat', newsletter: 'mail', video: 'video' };
const FONT: Record<string, string> = { sans: 'ui-sans-serif, system-ui, sans-serif', serif: 'ui-serif, Georgia, serif', rounded: 'ui-rounded, "Trebuchet MS", system-ui, sans-serif' };
const RADIUS: Record<string, string> = { none: '0', sm: '4px', md: '8px', full: '9999px' };
const QUICK_COLORS = ['#5B3DF5', '#7C3AED', '#E11D74', '#DC2626', '#EA580C', '#B45309', '#059669', '#0EA5E9', '#1D4ED8', '#111827'];

function Svg({ d, size = 16, className }: { d: keyof typeof ICON; size?: number; className?: string }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}><path d={ICON[d]} /></svg>;
}

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
      {value && <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2"><img src={value} alt="" className="h-16 w-24 rounded-lg object-cover" /><button type="button" className="text-sm text-slate-500 underline hover:text-red-700" onClick={() => onChange(null)}>Remover imagem</button></div>}
      <ImageUploader key={value ?? 'vazio'} kind="banner" label={value ? 'Trocar imagem' : 'Enviar imagem do computador'} onUploaded={urls => onChange(urls[0])} />
      <label className="text-xs text-slate-500">Ou cole o endereço (https://…)<input type="url" className="input" value={value ?? ''} onChange={e => onChange(e.currentTarget.value || null)} /></label></div>;
  }
  if (spec.kind === 'products') return <ProductPicker label={spec.label} max={spec.max} help={spec.help} value={Array.isArray(value) ? value : []} onChange={onChange} />;
  if (spec.kind === 'list') {
    const list: Json[] = Array.isArray(value) ? value : [];
    return <fieldset className="grid gap-3 rounded-xl border border-slate-200 p-3"><legend className="px-1 text-sm font-medium">{spec.label}</legend>
      {list.map((item, index) => <div key={index} className="grid gap-3 rounded-lg bg-slate-50 p-3">
        <div className="flex items-center justify-between"><b className="text-xs text-slate-500">{spec.itemLabel} {index + 1}</b>
          <div className="flex gap-1 text-sm">
            <button type="button" aria-label={`Subir ${spec.itemLabel} ${index + 1}`} disabled={index === 0} onClick={() => onChange(moveItem(list, index, index - 1))} className="rounded-md border border-slate-200 bg-surface p-1 disabled:opacity-30"><Svg d="up" size={14} /></button>
            <button type="button" aria-label={`Descer ${spec.itemLabel} ${index + 1}`} disabled={index === list.length - 1} onClick={() => onChange(moveItem(list, index, index + 1))} className="rounded-md border border-slate-200 bg-surface p-1 disabled:opacity-30"><Svg d="down" size={14} /></button>
            <button type="button" aria-label={`Remover ${spec.itemLabel} ${index + 1}`} onClick={() => onChange(list.filter((_, i) => i !== index))} className="rounded-md border border-slate-200 bg-surface p-1 text-red-700"><Svg d="trash" size={14} /></button></div></div>
        {spec.fields.map(sub => <Field key={sub.key} spec={sub} value={item[sub.key]} onChange={v => onChange(list.map((x, i) => (i === index ? { ...x, [sub.key]: v } : x)))} />)}
      </div>)}
      {list.length < spec.max && <button type="button" className="inline-flex items-center gap-1.5 justify-self-start rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium hover:border-brand hover:text-brand" onClick={() => onChange([...list, structuredClone(spec.defaults)])}><Svg d="plus" size={14} />Adicionar {spec.itemLabel.toLowerCase()}</button>}
    </fieldset>;
  }
  if (spec.kind === 'select') return <label className="text-sm font-medium">{spec.label}<select className="input" value={value ?? spec.options[0][0]} onChange={e => onChange(e.currentTarget.value)}>{spec.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
  if (spec.kind === 'number') return <label className="text-sm font-medium">{spec.label}<input type="number" className="input" min={spec.min} max={spec.max} value={value ?? ''} onChange={e => onChange(e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value))} /></label>;
  if (spec.kind === 'textarea') return <label htmlFor={id} className="text-sm font-medium">{spec.label}<textarea id={id} className="input" rows={3} maxLength={spec.max} value={value ?? ''} onChange={e => onChange(e.currentTarget.value)} /></label>;
  return <label htmlFor={id} className="text-sm font-medium">{spec.label}<input id={id} type="text" className="input" maxLength={spec.max} placeholder={spec.kind === 'url' ? spec.placeholder : undefined} value={value ?? ''} onChange={e => onChange(e.currentTarget.value)} />{spec.help && <span className="mt-1 block text-xs font-normal text-slate-500">{spec.help}</span>}</label>;
}

/** Escolha visual: cada opção mostra uma miniatura do resultado. */
function Choice<T extends string>({ label, value, options, onChange, cols = 3 }: { label: string; value: T; options: [T, string, React.ReactNode][]; onChange: (v: T) => void; cols?: 2 | 3 | 4 }) {
  const grid = cols === 2 ? 'grid-cols-2' : cols === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3';
  return <div role="group" aria-label={label}><p className="text-sm font-medium">{label}</p>
    <div className={'mt-2 grid gap-2 ' + grid}>{options.map(([v, l, preview]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)} className={'grid justify-items-center gap-2 rounded-xl border p-2.5 text-xs transition ' + (value === v ? 'border-brand bg-violet-50 font-semibold text-brand ring-1 ring-brand' : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50')}>
      <span aria-hidden className="flex h-10 w-full items-center justify-center">{preview}</span>{l}</button>)}</div></div>;
}

function Card({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return <section className="card grid gap-4 p-4 sm:p-5"><div><h3 className="font-bold">{title}</h3>{help && <p className="mt-0.5 text-xs text-slate-500">{help}</p>}</div>{children}</section>;
}

function ColorRow({ label, value, fallback, onChange, onReset }: { label: string; value: string | undefined; fallback: string; onChange: (hex: string) => void; onReset?: () => void }) {
  return <div className="flex items-center gap-3">
    <input aria-label={label} type="color" value={value ?? fallback} onChange={e => onChange(e.currentTarget.value.toUpperCase())} className="h-11 w-11 shrink-0 cursor-pointer appearance-none rounded-full border border-slate-300 bg-transparent p-0.5 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0" />
    <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{label}</span><span className="block font-mono text-xs uppercase text-slate-500">{value ?? `${fallback} (padrão)`}</span></span>
    {onReset && <button type="button" className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 underline hover:bg-slate-100" onClick={onReset}>padrão</button>}
  </div>;
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
  const [view, setView] = useState<'edit' | 'preview'>('edit');
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
  const accentFg = accentContrast >= 3 ? '#FFFFFF' : '#111827';

  const allowed = page === 'home' ? catalog : catalog.filter(([type]) => PAGE_TYPES.includes(type));
  const editable = page === 'home' || page === 'category' || page === 'product';
  const problem = status === 'error' || status === 'conflict';
  const draft = hasDraft || status === 'dirty' || status === 'saving';
  const deviceToggle = <div role="group" aria-label="Tamanho da prévia" className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">{(['desktop', 'mobile'] as const).map(d => <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)} title={d === 'desktop' ? 'Computador' : 'Celular'} className={'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ' + (device === d ? 'bg-surface text-brand shadow-sm' : 'text-slate-500 hover:text-slate-900')}><Svg d={d === 'desktop' ? 'monitor' : 'phone'} size={14} /><span className="hidden sm:inline">{d === 'desktop' ? 'Computador' : 'Celular'}</span><span className="sr-only sm:hidden">{d === 'desktop' ? 'Computador' : 'Celular'}</span></button>)}</div>;

  return <div className="grid gap-5">
    {/* Barra fixa: situação do rascunho e ações principais sempre à mão. */}
    <div className="card sticky top-[4.5rem] z-10 flex flex-wrap items-center gap-x-4 gap-y-3 bg-surface/95 p-3 backdrop-blur sm:px-4">
      <div className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 sm:w-auto sm:flex-1">
        <span className={'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ' + (draft ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800')}><span aria-hidden className={'h-2 w-2 rounded-full ' + (draft ? 'bg-amber-500' : 'bg-emerald-500')} />{draft ? 'Rascunho não publicado' : 'Tudo publicado'}</span>
        <p role="status" aria-live="polite" className={'inline-flex items-center gap-1.5 text-xs font-medium ' + (problem ? 'text-red-700' : status === 'saved' ? 'text-emerald-700' : 'text-slate-500')}>{status === 'saving' && <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />}{statusText[status]}</p>
      </div>
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <div role="group" aria-label="Mostrar" className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 xl:hidden">{(['edit', 'preview'] as const).map(v => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ' + (view === v ? 'bg-surface text-brand shadow-sm' : 'text-slate-500')}><Svg d={v === 'edit' ? 'pencil' : 'eye'} size={14} />{v === 'edit' ? 'Editar' : 'Prévia'}</button>)}</div>
        <a href={PREVIEW_PATH[page]} target="_blank" rel="noopener" aria-label="Pré-visualizar em nova aba" className="button-ghost gap-1.5 !px-3 !py-2 text-sm"><Svg d="external" size={15} /><span className="hidden sm:inline">Pré-visualizar</span></a>
        <button type="button" className="button ml-auto gap-1.5 !px-4 !py-2 text-sm disabled:opacity-60" disabled={status === 'saving' || status === 'conflict'} onClick={() => void publish()}>Publicar</button>
      </div>
      {message && <p role={status === 'saved' ? 'status' : 'alert'} className={'w-full rounded-lg px-3 py-2 text-sm ' + (status === 'saved' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700')}>{message}{status === 'conflict' && <> <button type="button" className="font-semibold underline" onClick={() => router.refresh()}>Recarregar</button></>}</p>}
    </div>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className={'min-w-0 content-start gap-4 ' + (view === 'preview' ? 'hidden xl:grid' : 'grid')}>
        <nav aria-label="O que personalizar" className="card p-1.5">
          <ul className="grid grid-cols-5 gap-1">{PAGES.map(id => <li key={id} className="min-w-0"><button type="button" aria-current={page === id ? 'page' : undefined} title={PAGE_LABEL[id]} onClick={() => { setPage(id); setOpen(null); }} className={'flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] font-semibold transition sm:text-xs ' + (page === id ? 'bg-violet-50 text-brand' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900')}><Svg d={PAGE_ICON[id]} size={18} /><span className="max-w-full truncate">{PAGE_TAB[id]}</span></button></li>)}</ul>
        </nav>
        <div className="px-1"><h2 className="text-xl font-bold">{PAGE_LABEL[page]}</h2><p className="mt-1 text-sm text-slate-500">{PAGE_HELP[page]}</p></div>

        {editable && <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3" aria-label={`Seções da ${PAGE_LABEL[page].toLowerCase()}`}>
          <ol className="grid grid-cols-[minmax(0,1fr)] gap-2">{sections.map((section, index) => {
            const spec = SECTION_CATALOG[section.type];
            const issue = incomplete(section);
            const active = open === section.id;
            return <li key={section.id} draggable={!active} onDragStart={() => setDragId(section.id)} onDragEnd={() => setDragId(null)} onDragOver={e => e.preventDefault()}
              onDrop={() => { if (dragId) { const from = sections.findIndex(s => s.id === dragId); setSections(list => moveItem(list, from, index)); } setDragId(null); }}
              className={'card min-w-0 overflow-hidden transition ' + (section.hidden ? 'opacity-60 ' : '') + (active || dragId === section.id ? 'ring-2 ring-brand' : 'hover:border-slate-300')}>
              <div className="flex items-center gap-2 p-2.5">
                <span aria-hidden className="cursor-grab select-none px-0.5 text-slate-300" title="Arraste para reordenar">⋮⋮</span>
                <button type="button" aria-pressed={active} aria-expanded={active} onClick={() => setOpen(active ? null : section.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ' + (active ? 'bg-brand text-brand-fg' : 'bg-slate-100 text-slate-500')}><Svg d={SECTION_ICON[section.type]} size={17} /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{spec.label}</span><span className={'block truncate text-xs ' + (issue && !section.hidden ? 'text-amber-700' : 'text-slate-500')}>{section.hidden ? 'Oculta na loja' : issue ? `Incompleta (${issue})` : spec.description}</span></span>
                  <Svg d="chevron" size={16} className={'shrink-0 text-slate-400 transition-transform ' + (active ? 'rotate-90' : '')} />
                </button>
              </div>
              <div className="flex items-center gap-1 border-t border-slate-100 bg-slate-50/60 px-2.5 py-1.5 text-slate-500">
                <button type="button" aria-label={`Subir ${spec.label}`} title="Subir" disabled={index === 0} onClick={() => setSections(l => moveItem(l, index, index - 1))} className="rounded-md p-1.5 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30"><Svg d="up" size={15} /></button>
                <button type="button" aria-label={`Descer ${spec.label}`} title="Descer" disabled={index === sections.length - 1} onClick={() => setSections(l => moveItem(l, index, index + 1))} className="rounded-md p-1.5 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30"><Svg d="down" size={15} /></button>
                <button type="button" aria-pressed={section.hidden} aria-label={section.hidden ? `Mostrar ${spec.label}` : `Ocultar ${spec.label}`} title={section.hidden ? 'Mostrar' : 'Ocultar'} onClick={() => setSections(l => l.map(s => (s.id === section.id ? { ...s, hidden: !s.hidden } : s)))} className="rounded-md p-1.5 hover:bg-slate-100 hover:text-slate-900"><Svg d={section.hidden ? 'eyeOff' : 'eye'} size={15} /></button>
                <button type="button" aria-label={`Duplicar ${spec.label}`} title="Duplicar" disabled={sections.length >= 30} onClick={() => setSections(l => duplicateSection(l, section.id))} className="rounded-md p-1.5 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30"><Svg d="copy" size={15} /></button>
                <button type="button" aria-label={`Excluir ${spec.label}`} title="Excluir" onClick={() => { if (window.confirm(`Excluir a seção "${spec.label}"?`)) { setSections(l => l.filter(s => s.id !== section.id)); if (active) setOpen(null); } }} className="ml-auto rounded-md p-1.5 text-red-700 hover:bg-red-50"><Svg d="trash" size={15} /></button>
              </div>
              {active && <div className="grid gap-4 border-t border-slate-200 p-4" aria-label={`Configurações de ${spec.label}`} role="group">
                {spec.fields.length === 0 && <p className="text-sm text-slate-500">Mostra os banners cadastrados em <a className="font-medium text-brand underline" href="/painel/banners">Banners</a>. {!hasBanners && 'Ainda não há banners ativos, então esta seção não aparece.'}</p>}
                {spec.fields.map(field => <Field key={section.id + field.key} spec={field} value={section.props[field.key]} onChange={v => setProps(section.id, field.key, v)} />)}
              </div>}
            </li>;
          })}</ol>
          {sections.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Nenhuma seção nesta página ainda. Escolha uma abaixo.</p>}
          <details className="card group p-0" open={sections.length === 0}><summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-sm font-semibold text-brand [&::-webkit-details-marker]:hidden"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50"><Svg d="plus" size={16} /></span>Adicionar seção<Svg d="chevron" size={16} className="ml-auto text-slate-400 transition-transform group-open:rotate-90" /></summary>
            <div className="grid grid-cols-1 gap-2 border-t border-slate-200 p-3 sm:grid-cols-2">{allowed.map(([type, spec]) => <button key={type} type="button" disabled={sections.length >= 30} onClick={() => { const s = newSection(type); setSections(l => [...l, s]); setOpen(s.id); }} className="flex items-start gap-2.5 rounded-xl border border-slate-200 p-2.5 text-left transition hover:border-brand hover:bg-violet-50 disabled:opacity-40"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500"><Svg d={SECTION_ICON[type]} size={15} /></span><span className="min-w-0"><span className="block text-sm font-semibold">{spec.label}</span><span className="block text-xs text-slate-500">{spec.description}</span></span></button>)}</div>
          </details>
          {page === 'home' && <p className="px-1 text-xs text-slate-500">Blog ainda não está disponível. O banner fixo de cada categoria fica em Categorias.</p>}
          <section className="card p-4"><h3 className="text-sm font-bold">Páginas institucionais</h3><p className="mt-0.5 text-xs text-slate-500">O texto delas é editado em Páginas.</p>
            <ul className="mt-2 flex flex-wrap gap-1.5 text-sm">{institutional.map(p => <li key={p.slug}><a href="/painel/paginas" className="block max-w-[12rem] truncate rounded-full border border-slate-200 px-3 py-1 text-slate-600 hover:border-brand hover:text-brand" title="Editar o texto em Páginas">{p.title}</a></li>)}
              {!institutional.length && <li className="text-xs text-slate-500">Nenhuma ainda.</li>}</ul>
            <a href="/painel/paginas" className="mt-3 inline-block text-xs font-semibold text-brand hover:underline">Gerenciar páginas →</a>
          </section>
        </section>}

        {page === 'visual' && <div className="grid gap-4">
          <Card title="Tema base" help="Um ponto de partida. Depois ajuste cada detalhe abaixo.">
            <div className="grid grid-cols-2 gap-2">{Object.entries(PRESETS).map(([key, p]) => {
              const on = (doc.design.preset ?? 'classico') === key;
              const accent = p.accent ?? (key === (doc.design.preset ?? 'classico') ? doc.accentColor : DEFAULT_ACCENT);
              return <button key={key} type="button" aria-pressed={on} onClick={() => update(d => ({ design: { preset: key, logoUrl: d.design.logoUrl, faviconUrl: d.design.faviconUrl, backgroundColor: d.design.backgroundColor, textColor: d.design.textColor }, accentColor: p.accent ?? d.accentColor }))} className={'grid gap-2 rounded-xl border p-3 text-left transition ' + (on ? 'border-brand bg-violet-50 ring-1 ring-brand' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50')}>
                <span aria-hidden className="flex items-center gap-2"><span className="text-xl font-bold" style={{ fontFamily: FONT[p.design.font] }}>Aa</span><span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: accent }} /><span className="ml-auto h-4 w-10" style={{ backgroundColor: accent, borderRadius: RADIUS[p.design.buttonRadius] }} /></span>
                <span><span className="block text-sm font-semibold">{p.label}</span><span className="block text-xs text-slate-500">{p.description}</span></span></button>;
            })}</div>
            <a href="/painel/site/temas" className="text-xs font-semibold text-brand hover:underline">Ver temas prontos completos (com seções) →</a>
          </Card>

          <Card title="Cores" help="A cor de destaque aparece em botões, links e preços.">
            <ColorRow label="Cor de destaque" value={doc.accentColor} fallback={DEFAULT_ACCENT} onChange={hex => update({ accentColor: hex })} onReset={doc.accentColor !== DEFAULT_ACCENT ? () => update({ accentColor: DEFAULT_ACCENT }) : undefined} />
            <div role="group" aria-label="Sugestões de cor de destaque" className="flex flex-wrap gap-2">{QUICK_COLORS.map(hex => <button key={hex} type="button" aria-label={`Usar a cor ${hex}`} aria-pressed={doc.accentColor === hex} title={hex} onClick={() => update({ accentColor: hex })} className={'h-7 w-7 rounded-full border border-black/10 transition hover:scale-110 ' + (doc.accentColor === hex ? 'ring-2 ring-brand ring-offset-2 ring-offset-surface' : '')} style={{ backgroundColor: hex }} />)}</div>
            {accentContrast < 3 && <p role="note" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Esta cor é clara: o texto dos botões ficará escuro automaticamente para manter a leitura.</p>}
            <div className="grid gap-3 border-t border-slate-200 pt-4">
              <ColorRow label="Cor do texto" value={doc.design.textColor} fallback="#0F172A" onChange={hex => setDesign({ textColor: hex })} onReset={doc.design.textColor ? () => setDesign({ textColor: undefined }) : undefined} />
              <ColorRow label="Cor de fundo" value={doc.design.backgroundColor} fallback="#F8FAFC" onChange={hex => setDesign({ backgroundColor: hex })} onReset={doc.design.backgroundColor ? () => setDesign({ backgroundColor: undefined }) : undefined} />
            </div>
            <div aria-hidden className="rounded-xl border border-slate-200 p-4" style={{ backgroundColor: doc.design.backgroundColor ?? '#F8FAFC', color: doc.design.textColor ?? '#0F172A', fontFamily: FONT[doc.design.font ?? preset.design.font] }}>
              <p className="text-sm font-bold">Assim fica o texto da loja</p><p className="mt-0.5 text-xs opacity-75">Confira se dá para ler com conforto.</p>
              <span className="mt-3 inline-block px-3 py-1.5 text-xs font-semibold" style={{ backgroundColor: doc.accentColor, color: accentFg, borderRadius: RADIUS[doc.design.buttonRadius ?? preset.design.buttonRadius] }}>Comprar agora</span>
            </div>
            {textBg !== null && textBg < 4.5 && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Contraste baixo entre texto e fundo ({textBg.toFixed(1)}:1; o mínimo é 4,5:1). A publicação será recusada.</p>}
          </Card>

          <Card title="Tipografia">
            <Choice label="Fonte do texto" value={(doc.design.font ?? preset.design.font) as 'sans'} onChange={v => setDesign({ font: v })} options={[['sans', 'Moderna', <span key="s" className="text-2xl" style={{ fontFamily: FONT.sans }}>Aa</span>], ['serif', 'Clássica', <span key="r" className="text-2xl" style={{ fontFamily: FONT.serif }}>Aa</span>], ['rounded', 'Arredondada', <span key="o" className="text-2xl" style={{ fontFamily: FONT.rounded }}>Aa</span>]]} />
            <Choice label="Títulos" value={(doc.design.headingFont ?? 'same') as 'same'} onChange={v => setDesign({ headingFont: v })} options={[['same', 'Igual ao texto', <span key="s" className="text-base font-bold">Título</span>], ['serif', 'Serifa', <span key="r" className="text-base font-bold" style={{ fontFamily: FONT.serif }}>Título</span>], ['display', 'Impacto', <span key="d" className="text-lg font-black tracking-tighter">Título</span>]]} />
          </Card>

          <Card title="Estilo">
            <Choice label="Botões" cols={4} value={(doc.design.buttonRadius ?? preset.design.buttonRadius) as 'md'} onChange={v => setDesign({ buttonRadius: v })} options={(['none', 'sm', 'md', 'full'] as const).map(r => [r, { none: 'Retos', sm: 'Leves', md: 'Suaves', full: 'Redondos' }[r], <span key={r} className="h-5 w-12" style={{ backgroundColor: doc.accentColor, borderRadius: RADIUS[r] }} />])} />
            <Choice label="Estilo dos cartões" cols={4} value={(doc.design.cardStyle ?? 'soft') as 'soft'} onChange={v => setDesign({ cardStyle: v })} options={[['soft', 'Suave', <span key="s" className="h-8 w-10 rounded-lg border border-slate-200 bg-surface shadow-sm" />], ['flat', 'Plano', <span key="f" className="h-8 w-10 rounded-md bg-slate-200" />], ['outline', 'Contorno', <span key="o" className="h-8 w-10 rounded border-2 border-slate-400" />], ['elevated', 'Sombra', <span key="e" className="h-8 w-10 rounded-lg bg-surface shadow-lg ring-1 ring-black/5" />]]} />
            <Choice label="Destaque da página inicial" value={(doc.design.heroTone ?? 'dark') as 'dark'} onChange={v => setDesign({ heroTone: v })} options={[['dark', 'Escuro', <span key="d" className="h-8 w-12 rounded-md" style={{ backgroundColor: '#111827' }} />], ['light', 'Claro', <span key="l" className="h-8 w-12 rounded-md border border-slate-200" style={{ backgroundColor: doc.accentColor + '18' }} />], ['brand', 'Cor da marca', <span key="b" className="h-8 w-12 rounded-md" style={{ backgroundColor: doc.accentColor }} />]]} />
            <Choice label="Modo da loja" cols={2} value={(doc.design.mode ?? 'light') as 'light'} onChange={v => setDesign({ mode: v })} options={[['light', 'Claro', <span key="l" className="grid h-9 w-14 content-center gap-1 rounded-md border border-slate-200 px-2" style={{ backgroundColor: '#FFFFFF' }}><span className="h-1 rounded" style={{ backgroundColor: '#0F172A' }} /><span className="h-1 w-2/3 rounded" style={{ backgroundColor: '#94A3B8' }} /></span>], ['dark', 'Escuro', <span key="d" className="grid h-9 w-14 content-center gap-1 rounded-md px-2" style={{ backgroundColor: '#111827' }}><span className="h-1 rounded" style={{ backgroundColor: '#F1F5F9' }} /><span className="h-1 w-2/3 rounded" style={{ backgroundColor: '#64748B' }} /></span>]]} />
          </Card>

          <Card title="Layout">
            <Choice label="Largura da página" value={(doc.design.containerWidth ?? preset.design.containerWidth) as 'normal'} onChange={v => setDesign({ containerWidth: v })} options={(['narrow', 'normal', 'wide'] as const).map(w => [w, { narrow: 'Estreita', normal: 'Normal', wide: 'Larga' }[w], <span key={w} className="flex h-8 w-14 items-center justify-center rounded border border-slate-300"><span className="h-5 rounded-sm bg-slate-300" style={{ width: { narrow: '45%', normal: '70%', wide: '92%' }[w] }} /></span>])} />
            <Choice label="Espaçamento entre seções" value={(doc.design.spacing ?? preset.design.spacing) as 'normal'} onChange={v => setDesign({ spacing: v })} options={(['compact', 'normal', 'relaxed'] as const).map(s => [s, { compact: 'Compacto', normal: 'Normal', relaxed: 'Amplo' }[s], <span key={s} className="grid w-10" style={{ gap: { compact: '2px', normal: '5px', relaxed: '9px' }[s] }}><span className="h-1.5 rounded-sm bg-slate-300" /><span className="h-1.5 rounded-sm bg-slate-300" /><span className="h-1.5 rounded-sm bg-slate-300" /></span>])} />
          </Card>
        </div>}

        {page === 'brand' && <div className="grid gap-4">
          <Card title="Logo" help="Aparece no topo da loja. Prefira PNG ou SVG com fundo transparente.">
            {doc.design.logoUrl ? <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><img src={doc.design.logoUrl} alt="Logo atual" className="max-h-12 max-w-40 object-contain" /><button type="button" className="ml-auto text-sm text-slate-500 underline hover:text-red-700" onClick={() => setDesign({ logoUrl: null })}>Remover</button></div>
              : <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">Sem logo: a loja mostra o nome em texto.</p>}
            <ImageUploader kind="other" label="Enviar logo" onUploaded={urls => setDesign({ logoUrl: urls[0] })} />
          </Card>
          <Card title="Favicon (ícone da aba)" help="Quadrado, 64 × 64 px ou maior.">
            {doc.design.faviconUrl && <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="flex items-center gap-2 rounded-t-lg bg-surface px-3 py-1.5 text-xs shadow-sm"><img src={doc.design.faviconUrl} alt="Favicon atual" className="h-4 w-4 object-contain" />Sua loja</span><button type="button" className="ml-auto text-sm text-slate-500 underline hover:text-red-700" onClick={() => setDesign({ faviconUrl: null })}>Remover</button></div>}
            <ImageUploader kind="other" label="Enviar favicon (quadrado, 64 × 64 px ou maior)" onUploaded={urls => setDesign({ faviconUrl: urls[0] })} />
          </Card>
          <Card title="Faixa de aviso" help="Uma frase curta no topo de todas as páginas. Deixe vazio para não mostrar.">
            <label className="text-sm font-medium">Mensagem no topo da loja<input className="input" maxLength={100} placeholder="Frete grátis acima de R$ 299" value={doc.announcementText} onChange={e => update({ announcementText: e.currentTarget.value })} /></label>
            {doc.announcementText && <p aria-hidden className="truncate rounded-lg px-3 py-2 text-center text-xs font-semibold" style={{ backgroundColor: doc.accentColor, color: accentFg }}>{doc.announcementText}</p>}
          </Card>
        </div>}
      </div>

      <section className={'min-w-0 xl:sticky xl:top-[9.5rem] xl:self-start ' + (view === 'edit' ? 'hidden xl:block' : 'block')} aria-label="Prévia">
        <div className="card overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-3 py-2">
            <span aria-hidden className="hidden gap-1.5 sm:flex"><span className="h-2.5 w-2.5 rounded-full bg-red-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /></span>
            <h2 className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-500">Prévia do rascunho (privada) · {PAGE_LABEL[page === 'visual' || page === 'brand' ? 'home' : page]}</h2>
            {deviceToggle}
            <a href={PREVIEW_PATH[page]} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand" title="Abrir em nova aba"><Svg d="external" size={14} /><span className="sr-only">Abrir em nova aba</span></a>
          </div>
          <div className={'bg-slate-100 ' + (device === 'mobile' ? 'p-4' : '')}>
            <div className={'mx-auto overflow-hidden bg-surface ' + (device === 'mobile' ? 'w-[390px] max-w-full rounded-[1.75rem] border-[8px] border-slate-300 shadow-xl' : 'w-full')}>
              <iframe key={device + page} title="Prévia da loja" src={`${PREVIEW_PATH[page]}?k=${previewKey}`} className={'block w-full border-0 ' + (device === 'mobile' ? 'h-[70vh] min-h-[520px] xl:h-[calc(100vh-15rem)]' : 'h-[75vh] min-h-[560px] xl:h-[calc(100vh-13rem)]')} sandbox="allow-same-origin allow-scripts allow-forms" />
            </div>
          </div>
        </div>
        <p className="mt-2 px-1 text-xs text-slate-500">A prévia atualiza depois de cada salvamento automático. Ela mostra o rascunho; os clientes só veem o que foi publicado.</p>
      </section>
    </div>
  </div>;
}
