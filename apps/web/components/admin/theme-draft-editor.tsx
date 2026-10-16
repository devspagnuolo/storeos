'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from 'react';
import { ImageUploader } from './image-uploader';
import { ThemeCompare } from './theme-compare';
import { publishThemeAction, saveThemeDraftAction, validateThemeDraftAction, type ThemeCheckResult } from '../../app/admin/actions';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type ThemeSection = { id: string; type: string; enabled: boolean; settings: Record<string, JsonValue>; blocks: { id: string; type: string; enabled: boolean; settings: Record<string, JsonValue> }[] };
export type ThemeDocument = {
  schemaVersion: 1;
  themeRelease: string;
  templates: Record<string, { sections: ThemeSection[] }>;
  global: { designTokens: { colors?: Record<string, string>; typography?: Record<string, string | number>; spacing?: Record<string, string | number>; shape?: Record<string, string | number> }; settings: Record<string, JsonValue> };
};
type FieldSchema = { title?: string; type?: string; enum?: (string | number)[]; enumTitles?: string[]; maxLength?: number; minimum?: number; maximum?: number };
type BlockDefinition = { type: string; title: string; settingsSchema: { properties?: Record<string, FieldSchema> } };
type SectionDefinition = { type: string; title: string; description: string; allowedPageTypes?: string[]; maxBlocks: number; blockTypes: string[]; blockDefinitions?: BlockDefinition[]; settingsSchema: { properties?: Record<string, FieldSchema> }; required?: boolean };
export type ThemeManifest = { displayName: string; version: string; defaultDocument?: { templates: Record<string, { sections: ThemeSection[] } | undefined> }; templates: { pageType: string; title: string; required: boolean }[]; sections: SectionDefinition[]; globalSettingsSchema?: { properties?: Record<string, FieldSchema> } };

const PAGE_TITLES: Record<string, string> = { home: 'Página inicial', category: 'Categoria', product: 'Produto', search: 'Busca', cart: 'Carrinho', page: 'Página de conteúdo', content: 'Página de conteúdo', blog: 'Blog', 'blog-index': 'Blog', landing: 'Página de campanha', 'blog-post': 'Artigo do blog', article: 'Artigo do blog', 'not-found': 'Página não encontrada (404)', notFound: 'Página não encontrada (404)' };
const templateName = (manifest: ThemeManifest, pageType: string) => {
  const title = manifest.templates.find(template => template.pageType === pageType)?.title;
  return title && title !== pageType ? title : PAGE_TITLES[pageType] ?? pageType;
};

export type LinkOption = { group: string; label: string; href: string };
type FieldEnv = { links: LinkOption[]; issues: Map<string, string> };
const FieldContext = createContext<FieldEnv>({ links: [], issues: new Map() });
const HISTORY_LIMIT = 60;

/** Colunas do esboço conforme o tamanho escolhido: no celular vale a opção "no celular" do tema. */
function sketchColumns(size: 'desktop' | 'tablet' | 'mobile', mobile: JsonValue | undefined, desktop: JsonValue | undefined, mobileDefault: number, desktopDefault: number) {
  const value = Number(size === 'mobile' ? mobile ?? mobileDefault : desktop ?? desktopDefault);
  const columns = Number.isFinite(value) ? Math.round(value) : desktopDefault;
  return size === 'tablet' ? Math.max(2, Math.min(4, columns)) : Math.max(1, Math.min(6, columns));
}

function labelFor(key: string, schema: FieldSchema) {
  return schema.title ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, value => value.toUpperCase());
}

export function ThemeDraftEditor({ installationId, initialRevision, initialDocument, manifest, publishEnabled = false, links = [], published = null }: {
  installationId: string;
  /** Última versão publicada deste tema, para a comparação; null quando nunca foi publicado. */
  published?: { version: number; document: ThemeDocument } | null;
  links?: LinkOption[];
  publishEnabled?: boolean;
  initialRevision: number;
  initialDocument: ThemeDocument;
  manifest: ThemeManifest;
}) {
  const [document, setDocument] = useState<ThemeDocument>(() => structuredClone(initialDocument));
  const [revision, setRevision] = useState(initialRevision);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');
  const [dragged, setDragged] = useState<string | null>(null);
  const [previewSize, setPreviewSize] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [templateKey, setTemplateKey] = useState(() => ('home' in initialDocument.templates ? 'home' : Object.keys(initialDocument.templates)[0]) ?? 'home');
  const [saving, startSaving] = useTransition();
  const [publishing, startPublishing] = useTransition();
  const [checks, setChecks] = useState<ThemeCheckResult | null>(null);
  // Confere o rascunho salvo ao abrir e depois de cada gravação.
  useEffect(() => { let alive = true; validateThemeDraftAction(installationId).then(result => { if (alive) setChecks(result); }); return () => { alive = false; }; }, [installationId, revision]);
  const [selected, setSelected] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit');
  // Desfazer/refazer: pilhas de versões do documento inteiro (limitadas) — vale para qualquer campo, ordem ou bloco.
  const past = useRef<ThemeDocument[]>([]);
  const future = useRef<ThemeDocument[]>([]);
  const [, setHistoryTick] = useState(0);
  const lastPush = useRef(0);
  const latest = useRef(document);
  const sections = document.templates[templateKey]?.sections ?? [];
  const templateTitle = templateName(manifest, templateKey);
  const issues = new Map<string, string>([...(checks?.errors ?? []), ...(checks?.warnings ?? [])].map(item => [item.path, item.message]));

  function changeDocument(mutator: (current: ThemeDocument) => ThemeDocument) {
    // Calcula fora do setState (sem efeitos colaterais no updater) para o histórico ficar exato.
    const current = latest.current;
    const next = mutator(current);
    if (next === current) return;
    const now = Date.now();
    // Várias teclas seguidas no mesmo campo viram um único passo de desfazer.
    if (now - lastPush.current > 1000) { past.current = [...past.current.slice(-(HISTORY_LIMIT - 1)), current]; future.current = []; }
    lastPush.current = now;
    latest.current = next;
    setDocument(next);
    setHistoryTick(tick => tick + 1);
    setDirty(true);
    setNotice('');
  }

  const undo = useCallback(() => {
    const previous = past.current.at(-1);
    if (!previous) return;
    past.current = past.current.slice(0, -1);
    future.current = [latest.current, ...future.current];
    latest.current = previous;
    lastPush.current = 0;
    setDocument(previous); setDirty(true); setHistoryTick(tick => tick + 1);
  }, []);
  const redo = useCallback(() => {
    const next = future.current[0];
    if (!next) return;
    future.current = future.current.slice(1);
    past.current = [...past.current, latest.current];
    latest.current = next;
    lastPush.current = 0;
    setDocument(next); setDirty(true); setHistoryTick(tick => tick + 1);
  }, []);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      // Dentro de um campo de texto, o desfazer nativo do navegador continua valendo.
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
      else if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); redo(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  function selectSection(id: string) {
    setSelected(id);
    setMobileView('edit');
    // Espera a aba "Editar" aparecer (celular) antes de rolar até a seção.
    window.requestAnimationFrame(() => window.document.getElementById('secao-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function updateSection(id: string, change: (section: ThemeSection) => ThemeSection) {
    changeDocument(current => ({
      ...current,
      templates: {
        ...current.templates,
        [templateKey]: {
          ...current.templates[templateKey],
          sections: current.templates[templateKey].sections.map(section => section.id === id ? change(section) : section),
        },
      },
    }));
  }

  function moveSection(index: number, nextIndex: number) {
    if (nextIndex < 0 || nextIndex >= sections.length) return;
    changeDocument(current => {
      const ordered = [...current.templates[templateKey].sections];
      const [item] = ordered.splice(index, 1);
      ordered.splice(nextIndex, 0, item);
      return { ...current, templates: { ...current.templates, [templateKey]: { ...current.templates[templateKey], sections: ordered } } };
    });
  }

  /** Seções que este modelo de página aceita, para "Adicionar seção" (o tema decide; nada fora da lista entra). */
  const addable = manifest.sections.filter(definition => !definition.required && definition.allowedPageTypes?.includes(templateKey));

  function addSection(type: string) {
    const definition = manifest.sections.find(item => item.type === type);
    if (!definition || sections.length >= 30) return;
    // Começa com os textos de exemplo do próprio tema, quando ele traz essa seção pronta em alguma página.
    const sample = Object.values(manifest.defaultDocument?.templates ?? {}).flatMap(template => template?.sections ?? []).find(item => item.type === type);
    const id = type.replace(/^storeos\.|\.v\d+$/g, '') + '-' + crypto.randomUUID().slice(0, 8);
    const created: ThemeSection = { id, type, enabled: true, settings: structuredClone(sample?.settings ?? {}), blocks: (sample?.blocks ?? []).map(block => ({ ...structuredClone(block), id: crypto.randomUUID() })) };
    changeDocument(current => {
      const list = [...current.templates[templateKey].sections];
      const footer = list.findIndex(item => item.type === 'storeos.footer.v1');
      list.splice(footer >= 0 ? footer : list.length, 0, created);
      return { ...current, templates: { ...current.templates, [templateKey]: { ...current.templates[templateKey], sections: list } } };
    });
    selectSection(id);
  }

  function removeSection(id: string, title: string) {
    if (!window.confirm(`Remover a seção “${title}” desta página? Dá para desfazer com Ctrl+Z.`)) return;
    changeDocument(current => ({ ...current, templates: { ...current.templates, [templateKey]: { ...current.templates[templateKey], sections: current.templates[templateKey].sections.filter(item => item.id !== id) } } }));
  }

  function addBlock(sectionId: string, definition: BlockDefinition) {
    const id = crypto.randomUUID();
    const settings = Object.fromEntries(Object.entries(definition.settingsSchema.properties ?? {}).map(([key, schema]) => [
      key,
      // Lista de opções começa na primeira opção válida (texto vazio seria recusado na verificação).
      Array.isArray(schema.enum) && schema.enum.length ? schema.enum[0] as JsonValue : schema.type === 'boolean' ? false : schema.type === 'integer' || schema.type === 'number' ? schema.minimum ?? 0 : '',
    ])) as Record<string, JsonValue>;
    updateSection(sectionId, section => section.blocks.length >= (manifest.sections.find(item => item.type === section.type)?.maxBlocks ?? 0)
      ? section
      : { ...section, blocks: [...section.blocks, { id, type: definition.type, enabled: true, settings }] });
  }

  function publish() {
    if (dirty) { setNotice('Salve as alterações antes de publicar.'); return; }
    if (checks?.errors.length) { setNotice('Corrija os erros apontados antes de publicar.'); return; }
    const pending = checks?.warnings.length ? ` Ainda há ${checks.warnings.length} ${checks.warnings.length === 1 ? 'aviso' : 'avisos'} na verificação.` : '';
    if (!window.confirm(`Publicar este tema na loja?${pending} O tema atual será substituído e continuará disponível nas versões publicadas.`)) return;
    startPublishing(async () => {
      const result = await publishThemeAction(installationId, revision);
      setNotice(result.error ?? result.ok ?? 'Tema publicado.');
    });
  }

  function save() {
    startSaving(async () => {
      const snapshot = document;
      const result = await saveThemeDraftAction(installationId, revision, JSON.stringify(snapshot));
      if (result.error) { setNotice(result.error); setConflict(/outra sessão/i.test(result.error)); return; }
      if (result.revision) setRevision(result.revision);
      // Se a lojista mexeu enquanto salvava, continua pendente e o salvamento automático grava de novo.
      const changedMeanwhile = latest.current !== snapshot;
      setDirty(changedMeanwhile);
      if (!changedMeanwhile) setNotice(result.ok ?? 'Rascunho salvo.');
    });
  }

  const pageTitle = useCallback((pageType: string) => templateName(manifest, pageType), [manifest]);
  const tokens = document.global.designTokens;
  const colors = tokens.colors ?? {};
  const globalProperties = manifest.globalSettingsSchema?.properties ?? {};

  // Salva sozinho alguns segundos depois da última mudança; nunca publica.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!dirty || saving || publishing || conflict) return;
    const timer = window.setTimeout(() => saveRef.current(), 2500);
    return () => window.clearTimeout(timer);
  }, [document, dirty, saving, publishing, conflict]);

  return <FieldContext.Provider value={{ links, issues }}>
    {/* No celular e no tablet, editar e prévia viram abas; no computador ficam lado a lado. */}
    <div role="tablist" aria-label="Modo do editor" className="sticky top-16 z-10 mb-4 flex rounded-xl border bg-surface p-1 xl:hidden">
      {(['edit', 'preview'] as const).map(mode => <button key={mode} type="button" role="tab" aria-selected={mobileView === mode} className={'flex-1 rounded-lg px-3 py-2 text-sm font-semibold ' + (mobileView === mode ? 'bg-slate-900 text-white' : 'text-slate-600')} onClick={() => setMobileView(mode)}>{mode === 'edit' ? 'Editar' : 'Prévia'}</button>)}
    </div>
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_25rem]">
    <div className={'min-w-0 content-start gap-6 xl:grid [&>*]:min-w-0 ' + (mobileView === 'edit' ? 'grid' : 'hidden')}>
      <section className="rounded-2xl border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-sm font-semibold text-brand">RASCUNHO DO TEMA</p><h1 className="mt-1 text-2xl font-bold">{manifest.displayName}</h1><p className="mt-1 text-sm text-slate-500">Versão {manifest.version} · revisão {revision}</p></div>
          <div className="flex flex-wrap gap-2"><button type="button" className="button-ghost" disabled={!past.current.length} onClick={undo} title="Desfazer (Ctrl+Z)" aria-label="Desfazer">↶</button><button type="button" className="button-ghost" disabled={!future.current.length} onClick={redo} title="Refazer (Ctrl+Y)" aria-label="Refazer">↷</button><a className="button-ghost" href={'/previa/tema/' + encodeURIComponent(installationId)} target="_blank" rel="noopener" title={dirty ? 'Salve o rascunho para ver as últimas mudanças' : undefined}>Prévia real ↗</a><button type="button" className="button-ghost" disabled={!dirty || saving || publishing} onClick={save}>{saving ? 'Salvando…' : 'Salvar rascunho'}</button>{publishEnabled && <button type="button" className="button" disabled={dirty || saving || publishing} onClick={publish}>{publishing ? 'Publicando…' : 'Publicar na loja'}</button>}</div>
        </div>
        {!publishEnabled && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Temas avançados ainda estão em teste: você pode montar e salvar este rascunho, mas a publicação será liberada quando a prévia real das páginas estiver pronta. Para mudar a loja agora, use <a className="font-semibold underline" href="/painel/site">Personalizar loja</a>.</p>}
        {conflict && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">Este rascunho foi alterado em outra aba ou por outra pessoa. Para não sobrescrever, recarregue e refaça a última mudança. <button type="button" className="font-semibold underline" onClick={() => window.location.reload()}>Recarregar agora</button></p>}
        <CheckList checks={checks} dirty={dirty} />
        <p role={notice && !dirty ? 'status' : undefined} className={'mt-4 text-sm ' + (notice && !dirty ? 'text-emerald-700' : 'text-slate-600')}>{notice || (saving ? 'Salvando…' : dirty ? 'Alterações ainda não salvas: o rascunho é salvo sozinho em instantes.' : 'Tudo salvo. Este rascunho ainda não altera a loja publicada.')}</p>
      </section>

      <ThemeCompare installationId={installationId} document={document} published={published} manifest={manifest} templateKey={templateKey} pageTitle={pageTitle} dirty={dirty} />

      <section className="rounded-2xl border bg-surface p-5">
        <div><h2 className="text-lg font-bold">Identidade visual</h2><p className="mt-1 text-sm text-slate-500">A prévia acompanha as cores e a tipografia escolhidas.</p></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
          {([['primary', 'Cor principal', '#6D28D9'], ['background', 'Fundo', '#FFFFFF'], ['text', 'Texto', '#0F172A']] as const).map(([key, label, fallback]) =>
            <label key={key} className="flex items-center gap-3 text-sm font-medium">{label}<input aria-label={label} type="color" value={colors[key] ?? fallback} onChange={event => {
              const value = event.currentTarget.value.toUpperCase();
              changeDocument(current => ({ ...current, global: { ...current.global, designTokens: { ...current.global.designTokens, colors: { ...current.global.designTokens.colors, [key]: value } } } }));
            }} className="h-10 w-14 rounded border p-1" /></label>
          )}
          <label className="text-sm font-medium">Família tipográfica<select className="input" value={String(tokens.typography?.fontFamily ?? 'system')} onChange={event => {
            const fontFamily = event.currentTarget.value;
            changeDocument(current => ({ ...current, global: { ...current.global, designTokens: { ...current.global.designTokens, typography: { ...current.global.designTokens.typography, fontFamily } } } }));
          }}>
            <option value="system">Padrão do sistema</option><option value="sans-serif">Sem serifa</option><option value="serif">Serifada</option>
          </select></label>
          {Object.keys(globalProperties).length > 0 && <div className="grid gap-4 sm:col-span-2"><h3 className="font-semibold">Preferências do tema</h3>{Object.entries(globalProperties).map(([key, schema]) => {
            const value = document.global.settings[key];
            const setValue = (next: JsonValue) => changeDocument(current => ({ ...current, global: { ...current.global, settings: { ...current.global.settings, [key]: next } } }));
            return <SettingField key={key} path={`$.global.settings.${key}`} name={labelFor(key, schema)} schema={schema} value={value} onChange={setValue} />;
          })}</div>}
        </div>
      </section>

      <section className="grid gap-4 [&>*]:min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-bold">Seções: {templateTitle}</h2><p className="mt-1 text-sm text-slate-500">Cada página mantém sua própria ordem e configurações no rascunho.</p></div>
          <label className="w-full text-sm font-medium sm:w-auto sm:min-w-52">Editar página<select className="input" value={templateKey} onChange={event => setTemplateKey(event.currentTarget.value)}>{Object.keys(document.templates).map(pageType => <option key={pageType} value={pageType}>{templateName(manifest, pageType)}</option>)}</select></label>
        </div>
        {sections.map((section, index) => {
          const definition = manifest.sections.find(item => item.type === section.type);
          if (!definition) return null;
          const isRequired = Boolean(definition.required);
          return <article key={section.id} draggable onDragStart={() => setDragged(section.id)} onDragEnd={() => setDragged(null)} onDragOver={event => event.preventDefault()} onDrop={() => {
            if (!dragged) return;
            const from = sections.findIndex(item => item.id === dragged);
            if (from >= 0) moveSection(from, index);
            setDragged(null);
          }} id={'secao-' + section.id} onFocusCapture={() => setSelected(section.id)} className={'scroll-mt-20 rounded-2xl border bg-surface p-4 ' + (section.enabled ? '' : 'opacity-60 ') + (dragged === section.id || selected === section.id ? 'ring-2 ring-brand' : '')}>
            <div className="flex items-center gap-3">
              <span aria-hidden className="cursor-grab select-none text-slate-400" title="Arraste para reordenar">⋮⋮</span>
              <div className="min-w-0 flex-1"><h3 className="font-semibold">{definition.title}</h3><p className="text-xs text-slate-500">{definition.description}</p></div>
              <button type="button" className="rounded border px-2 py-1" aria-label={'Subir ' + definition.title} disabled={index === 0} onClick={() => moveSection(index, index - 1)}>↑</button>
              <button type="button" className="rounded border px-2 py-1" aria-label={'Descer ' + definition.title} disabled={index === sections.length - 1} onClick={() => moveSection(index, index + 1)}>↓</button>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={section.enabled} disabled={isRequired} onChange={event => {
                const enabled = event.currentTarget.checked;
                updateSection(section.id, current => ({ ...current, enabled }));
              }} />Visível</label>
              {!isRequired && <button type="button" className="rounded border px-2 py-1 text-red-700" aria-label={'Remover ' + definition.title} title="Remover seção" onClick={() => removeSection(section.id, definition.title)}>✕</button>}
            </div>
            {isRequired && <p className="mt-2 text-xs text-slate-500">Seção estrutural obrigatória do tema.</p>}
            <div className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2 [&>*]:min-w-0">
              {Object.entries(definition.settingsSchema.properties ?? {}).map(([key, schema]) => <SettingField key={key} path={`$.templates.${templateKey}.sections[${index}].settings.${key}`} name={labelFor(key, schema)} schema={schema} value={section.settings[key]} onChange={value => updateSection(section.id, current => ({ ...current, settings: { ...current.settings, [key]: value } }))} />)}
              {!Object.keys(definition.settingsSchema.properties ?? {}).length && <p className="text-sm text-slate-500">Esta seção não tem opções configuráveis nesta versão.</p>}
              {definition.blockDefinitions?.map(blockDefinition => {
                const blockInstances = section.blocks.filter(block => block.type === blockDefinition.type);
                return <div key={blockDefinition.type} className="grid gap-3 border-t pt-4 sm:col-span-2 [&>*]:min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-sm font-semibold">{blockDefinition.title}</h4><p className="text-xs text-slate-500">{blockInstances.length} de {definition.maxBlocks} blocos</p></div>
                    <button type="button" className="rounded-lg border px-3 py-2 text-sm font-semibold" disabled={section.blocks.length >= definition.maxBlocks} onClick={() => addBlock(section.id, blockDefinition)}>+ Adicionar bloco</button>
                  </div>
                  {blockInstances.map((block, blockIndex) => <fieldset key={block.id} className="grid min-w-0 gap-3 rounded-xl border p-3 sm:grid-cols-2 [&>*]:min-w-0">
                    <legend className="px-1 text-xs font-medium text-slate-500">{blockDefinition.title} {blockIndex + 1}</legend>
                    {Object.entries(blockDefinition.settingsSchema.properties ?? {}).map(([key, schema]) => <SettingField key={key} path={`$.templates.${templateKey}.sections[${index}].blocks[${section.blocks.indexOf(block)}].settings.${key}`} name={labelFor(key, schema)} schema={schema} value={block.settings[key]} onChange={value => updateSection(section.id, current => ({ ...current, blocks: current.blocks.map(item => item.id === block.id ? { ...item, settings: { ...item.settings, [key]: value } } : item) }))} />)}
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={block.enabled} onChange={event => { const enabled = event.currentTarget.checked; updateSection(section.id, current => ({ ...current, blocks: current.blocks.map(item => item.id === block.id ? { ...item, enabled } : item) })); }} />Visível</label>
                    <button type="button" className="justify-self-start text-sm font-semibold text-red-700 underline" onClick={() => updateSection(section.id, current => ({ ...current, blocks: current.blocks.filter(item => item.id !== block.id) }))}>Remover bloco</button>
                  </fieldset>)}
                </div>;
              })}
            </div>
          </article>;
        })}
        {addable.length > 0 && <label className="rounded-2xl border border-dashed p-4 text-sm font-medium">+ Adicionar seção nesta página
          <select className="input mt-2" value="" disabled={sections.length >= 30} onChange={event => { if (event.currentTarget.value) addSection(event.currentTarget.value); }}>
            <option value="">Escolha o tipo de seção…</option>
            {addable.map(definition => <option key={definition.type} value={definition.type}>{definition.title}{definition.description && definition.description !== definition.title ? ` — ${definition.description}` : ''}</option>)}
          </select>
          {sections.length >= 30 && <span className="mt-1 block text-xs font-normal text-amber-800">Limite de 30 seções por página.</span>}
        </label>}
      </section>
    </div>

    <div className={'min-w-0 xl:block ' + (mobileView === 'preview' ? 'block' : 'hidden')}><ThemeDraftPreview document={document} manifest={manifest} templateKey={templateKey} previewSize={previewSize} onPreviewSizeChange={setPreviewSize} selected={selected} onSelect={selectSection} /></div>
  </div></FieldContext.Provider>;
}

function ThemeDraftPreview({ document, manifest, templateKey, previewSize, onPreviewSizeChange, selected, onSelect }: {
  selected: string | null;
  onSelect: (id: string) => void;
  document: ThemeDocument;
  manifest: ThemeManifest;
  templateKey: string;
  previewSize: 'desktop' | 'tablet' | 'mobile';
  onPreviewSizeChange: (size: 'desktop' | 'tablet' | 'mobile') => void;
}) {
  const sections = document.templates[templateKey]?.sections ?? [];
  const colors = document.global.designTokens.colors ?? {};
  const font = String(document.global.designTokens.typography?.fontFamily ?? 'system');
  const fontFamily = font === 'system' ? 'system-ui, sans-serif' : font;
  const textColor = colors.text ?? '#0F172A';
  const background = colors.background ?? '#FFFFFF';
  const primary = colors.primary ?? '#6D28D9';
  const globalSettings = document.global.settings;
  const announcementText = String(globalSettings.announcementText ?? '');

  return <aside className="h-fit rounded-2xl border bg-surface p-4 xl:sticky xl:top-20">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-bold">Prévia: {templateName(manifest, templateKey)}</h2><p className="mt-1 text-xs text-slate-500">Atualiza enquanto você edita</p></div>
      <div className="flex rounded-lg border p-1" role="group" aria-label="Tamanho da prévia">
        <button type="button" aria-pressed={previewSize === 'desktop'} className={'rounded px-2 py-1 text-xs ' + (previewSize === 'desktop' ? 'bg-slate-900 text-white' : '')} onClick={() => onPreviewSizeChange('desktop')}>Desktop</button>
        <button type="button" aria-pressed={previewSize === 'tablet'} className={'rounded px-2 py-1 text-xs ' + (previewSize === 'tablet' ? 'bg-slate-900 text-white' : '')} onClick={() => onPreviewSizeChange('tablet')}>Tablet</button>
        <button type="button" aria-pressed={previewSize === 'mobile'} className={'rounded px-2 py-1 text-xs ' + (previewSize === 'mobile' ? 'bg-slate-900 text-white' : '')} onClick={() => onPreviewSizeChange('mobile')}>Celular</button>
      </div>
    </div>
    <p className="my-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Esboço rápido enquanto você edita; em Celular ele segue as opções “no celular” e “Mostrar em”. Para ver todas as páginas com seus produtos reais, clique em “Prévia real”.</p>
    <div className="overflow-auto rounded-xl border bg-slate-100 p-2">
      <div className="mx-auto max-h-[70vh] overflow-y-auto rounded-lg border shadow-sm transition-[width] duration-200" style={{ width: previewSize === 'mobile' ? 360 : previewSize === 'tablet' ? 768 : '100%', maxWidth: '100%' }}>
        <div style={{ color: textColor, backgroundColor: background, fontFamily }}>
          {sections.filter(section => section.enabled && !(previewSize === 'mobile' ? section.settings.visibility === 'desktop' : section.settings.visibility === 'mobile')).map(section => <div key={section.id} role="button" tabIndex={0} title="Clique para editar esta seção" aria-label={'Editar ' + (manifest.sections.find(item => item.type === section.type)?.title ?? 'seção')} onClick={() => onSelect(section.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(section.id); } }} className={'cursor-pointer outline-offset-[-2px] hover:outline hover:outline-2 hover:outline-brand/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ' + (selected === section.id ? 'outline outline-2 outline-brand' : '')}>{(() => {
            const definition = manifest.sections.find(item => item.type === section.type);
            const settings = section.settings;
            if (section.type === 'storeos.announcement.v1') {
              const message = String(settings.text ?? announcementText);
              if (!message || globalSettings.showAnnouncement === false) return null;
              return <div key={section.id} className="px-3 py-2 text-center text-xs" style={{ color: '#FFFFFF', backgroundColor: primary }}>{message}{settings.linkLabel ? <span className="ml-2 underline">{String(settings.linkLabel)}</span> : null}</div>;
            }
            if (section.type === 'storeos.header.v1') return <header key={section.id} className="flex items-center gap-3 border-b px-4 py-4">
              <strong className="mr-auto text-base">Sua loja</strong>
              {settings.showSearch !== false && <span className="rounded-full border px-3 py-2 text-xs text-slate-500">Buscar produtos…</span>}
              {settings.showAccount !== false && <span aria-label="Minha conta">♡</span>}
              {settings.showCart !== false && <span aria-label="Carrinho">▢</span>}
            </header>;
            if (section.type === 'storeos.hero.v1') return <section key={section.id} className="grid gap-3 px-5 py-8 sm:grid-cols-2 sm:items-center" style={{ background: 'linear-gradient(135deg, #f8fafc, #eef2ff)' }}>
              <div>{settings.eyebrow ? <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: primary }}>{String(settings.eyebrow)}</p> : null}
                <h3 className="text-2xl font-bold">{String(settings.title ?? '')}</h3><p className="mt-2 text-sm">{String(settings.subtitle ?? '')}</p>
                {settings.ctaLabel ? <span className="mt-4 inline-block rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: primary }}>{String(settings.ctaLabel)}</span> : null}
                {section.blocks.some(block => block.enabled && block.type !== 'storeos.hero.slide.v1') && <ul className="mt-4 flex flex-wrap gap-2">{section.blocks.filter(block => block.enabled && block.type !== 'storeos.hero.slide.v1').map(block => <li key={block.id} className="rounded-full border px-3 py-1 text-xs">{String(block.settings.title ?? '')}{block.settings.text ? ` · ${String(block.settings.text)}` : ''}</li>)}</ul>}
              </div>
              <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed bg-white/70 text-xs text-slate-500">{(() => { const extra = section.blocks.filter(block => block.enabled && block.type === 'storeos.hero.slide.v1').length; return extra ? `${extra + 1} banners se revezando` : settings.imageUrl ? 'Imagem do banner configurada' : 'Espaço do banner'; })()}</div>
            </section>;
            if (section.type === 'storeos.product-detail.v1') return <section key={section.id} className="grid gap-5 px-4 py-8 sm:grid-cols-2">
              <div className="flex aspect-[4/5] items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-500">Galeria demonstrativa do produto</div>
              <div><p className="text-xs text-slate-500">Marca da loja · SKU demonstrativo</p><h3 className="mt-2 text-2xl font-bold">Produto de exemplo</h3><p className="mt-3 text-xl font-semibold">R$ 149,90</p>
                {settings.showVariants !== false && <div className="mt-4"><p className="text-xs font-semibold">Tamanho</p><div className="mt-2 flex gap-2">{['P', 'M', 'G'].map(size => <span key={size} className="rounded border px-3 py-2 text-xs">{size}</span>)}</div></div>}
                {settings.showDescription !== false && <p className="mt-4 text-sm text-slate-600">Descrição demonstrativa do produto selecionado.</p>}
                <span className="mt-5 inline-block rounded-lg px-4 py-3 text-sm font-semibold text-white" style={{ backgroundColor: primary }}>{String(settings.buttonLabel ?? 'Adicionar ao carrinho')}</span>
              </div>
            </section>;
            if (section.type === 'storeos.search-results.v1') return <section key={section.id} className="px-4 py-7"><h3 className="text-lg font-bold">{String(settings.heading ?? 'Resultados')}</h3><p className="mt-1 text-xs text-slate-500">3 produtos encontrados · demonstração</p><div className="mt-4 grid grid-cols-2 gap-3">{['Produto encontrado', 'Outra opção'].map((item, index) => <div key={item} className="rounded-lg border"><div className="aspect-[4/5] bg-slate-100" /><p className="p-2 text-xs">{item}<br /><strong>R$ {index ? '129,90' : '89,90'}</strong></p></div>)}</div></section>;
            if (section.type === 'storeos.cart-summary.v1') return <section key={section.id} className="mx-auto max-w-sm px-4 py-10"><h3 className="text-xl font-bold">{String(settings.heading ?? 'Seu carrinho')}</h3><div className="my-5 rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">Seu carrinho de demonstração está vazio</div>{Boolean(settings.showShippingQuote) && <p className="mb-4 text-xs text-slate-500">Calcule o frete informando seu CEP.</p>}<span className="block rounded-lg px-4 py-3 text-center text-sm font-semibold text-white" style={{ backgroundColor: primary }}>{String(settings.buttonLabel ?? 'Continuar')}</span></section>;
            if (section.type === 'storeos.content-page.v1') return <section key={section.id} className={'mx-auto px-5 py-10 ' + (settings.width === 'wide' ? 'max-w-4xl' : 'max-w-2xl')}>{settings.showTitle !== false && <h3 className="text-2xl font-bold">{String(settings.heading ?? 'Sobre a loja')}</h3>}{settings.showUpdatedAt === true && <p className="mt-1 text-xs text-slate-500">Atualizada em 16 de outubro</p>}<p className="mt-4 whitespace-pre-wrap text-sm leading-6">{String(settings.body ?? 'O texto de cada página vem de Painel → Páginas. Aqui você escolhe só como ele aparece.')}</p></section>;
            if (section.type === 'storeos.blog-list.v1') return <section key={section.id} className="px-4 py-8"><h3 className="text-xl font-bold">{String(settings.heading ?? 'Blog')}</h3><div className="mt-4 grid gap-3 sm:grid-cols-2">{['Como escolher seu próximo look', 'Novidades da coleção'].map(title => <article key={title} className="rounded-lg border p-4"><div className="mb-3 aspect-video rounded bg-slate-100" /><h4 className="font-semibold">{title}</h4><p className="mt-2 text-xs text-slate-500">Artigo demonstrativo</p></article>)}</div></section>;
            if (section.type === 'storeos.blog-post.v1') return <article key={section.id} className="mx-auto max-w-2xl px-5 py-10"><p className="text-xs text-slate-500">Blog · autora · data</p><h3 className="mt-2 text-2xl font-bold">Título do artigo demonstrativo</h3><div className="my-5 aspect-video rounded-xl bg-slate-100" /><p className="text-sm leading-6">Conteúdo demonstrativo do artigo para visualizar a composição do tema.</p></article>;
            if (section.type === 'storeos.not-found.v1') return <section key={section.id} className="px-5 py-14 text-center"><p className="text-5xl font-bold" style={{ color: primary }}>404</p><h3 className="mt-3 text-xl font-bold">{String(settings.heading ?? '')}</h3><p className="mt-2 text-sm">{String(settings.message ?? '')}</p><span className="mt-5 inline-block rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: primary }}>{String(settings.buttonLabel ?? 'Voltar')}</span></section>;
            if (section.type === 'storeos.category-grid.v1') return <section key={section.id} className="px-4 py-6">
              <h3 className="text-lg font-bold">{String(settings.heading ?? '')}</h3><p className="mb-4 mt-1 text-xs text-slate-500">{String(settings.subheading ?? '')}</p>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${sketchColumns(previewSize, settings.mobileColumns, settings.columns, 2, 4)}, minmax(0, 1fr))` }}>
                {['Novidades', 'Mais vendidos', 'Vestidos', 'Acessórios', 'Blusas', 'Calças'].slice(0, Math.max(2, sketchColumns(previewSize, settings.mobileColumns, settings.columns, 2, 4))).map(category => <div key={category} className="rounded-lg border p-3 text-center text-xs">{category}</div>)}
              </div>
            </section>;
            if (section.type === 'storeos.product-collection.v1') return <section key={section.id} className="px-4 py-6">
              <h3 className="text-lg font-bold">{String(settings.heading ?? '')}</h3><p className="mb-4 mt-1 text-xs text-slate-500">{String(settings.subheading ?? '')}</p>
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${sketchColumns(previewSize, settings.mobileColumns, settings.columns, 2, 4)}, minmax(0, 1fr))` }}>{['Peça em destaque', 'Novidade da coleção', 'Mais vendida', 'Lançamento', 'Clássico', 'Promoção'].slice(0, Math.min(Number(settings.limit ?? 8), sketchColumns(previewSize, settings.mobileColumns, settings.columns, 2, 4))).map((product, index) => <div key={product} className="overflow-hidden rounded-lg border">
                <div className="flex aspect-[4/5] items-center justify-center bg-slate-100 text-2xl text-slate-400">◇</div><div className="p-2"><p className="text-xs">{product}</p><p className="mt-1 text-sm font-bold">R$ {index ? '129,90' : '89,90'}</p></div>
              </div>)}</div>
            </section>;
            const items = section.blocks.filter(block => block.enabled);
            if (section.type === 'storeos.carousel.v1') {
              const first = items[0]?.settings ?? {};
              return <section key={section.id} className="relative px-5 py-10" style={{ background: `linear-gradient(120deg, ${primary}22, ${primary}55)` }}>
                <h3 className="text-2xl font-bold">{String(first.title ?? 'Banner')}</h3><p className="mt-2 text-sm">{String(first.subtitle ?? '')}</p>
                {first.ctaLabel ? <span className="mt-4 inline-block rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: primary }}>{String(first.ctaLabel)}</span> : null}
                <p className="mt-4 flex gap-1.5">{items.map((block, index) => <span key={block.id} className={'h-2 rounded-full ' + (index ? 'w-2 bg-slate-400' : 'w-5 bg-slate-800')} />)}<span className="ml-2 text-xs text-slate-500">{items.length} {items.length === 1 ? 'banner' : 'banners'}{settings.autoplay ? ' · troca sozinho' : ''}</span></p>
              </section>;
            }
            if (section.type === 'storeos.benefits.v1') return <section key={section.id} className="grid grid-cols-2 gap-2 border-y px-4 py-3">{items.map(block => <div key={block.id} className="text-xs"><strong className="block" style={{ color: primary }}>{String(block.settings.title ?? '')}</strong><span className="text-slate-500">{String(block.settings.text ?? '')}</span></div>)}</section>;
            if (section.type === 'storeos.image.v1') return <section key={section.id} className="px-4 py-6">{settings.heading ? <h3 className="mb-3 text-lg font-bold">{String(settings.heading)}</h3> : null}<div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${previewSize === 'mobile' ? 1 : Math.max(1, Math.min(4, Number(settings.columns ?? 2)))}, minmax(0, 1fr))` }}>{items.map(block => <div key={block.id} className="flex aspect-video items-end rounded-lg p-2 text-xs font-semibold" style={{ background: `linear-gradient(135deg, ${primary}1f, ${primary}4d)` }}>{block.settings.imageUrl ? '🖼 ' : ''}{String(block.settings.label ?? '')}</div>)}</div></section>;
            if (section.type === 'storeos.testimonials.v1') return <section key={section.id} className="px-4 py-6"><h3 className="text-lg font-bold">{String(settings.heading ?? '')}</h3><div className="mt-3 grid gap-2 sm:grid-cols-3">{items.slice(0, 3).map(block => <figure key={block.id} className="rounded-lg border p-3 text-xs"><p style={{ color: primary }}>{'★'.repeat(Math.max(1, Math.min(5, Number(block.settings.rating ?? 5))))}</p><blockquote className="mt-1">“{String(block.settings.text ?? '')}”</blockquote><figcaption className="mt-2 font-semibold">{String(block.settings.name ?? '')}</figcaption></figure>)}</div></section>;
            if (section.type === 'storeos.faq.v1') return <section key={section.id} className="px-4 py-6"><h3 className="text-lg font-bold">{String(settings.heading ?? '')}</h3><ul className="mt-3 divide-y rounded-lg border text-xs">{items.map(block => <li key={block.id} className="flex justify-between p-3 font-semibold">{String(block.settings.question ?? '')}<span>+</span></li>)}</ul></section>;
            if (section.type === 'storeos.video.v1') return <section key={section.id} className="px-4 py-6">{settings.heading ? <h3 className="mb-3 text-lg font-bold">{String(settings.heading)}</h3> : null}<div className="flex aspect-video items-center justify-center rounded-lg bg-slate-900 text-xs text-white">{settings.videoUrl ? '▶ Vídeo configurado' : 'Cole o link do YouTube ou Vimeo'}</div></section>;
            if (section.type === 'storeos.rich-text.v1') return <section key={section.id} className={'px-5 py-8 ' + (settings.align === 'center' ? 'text-center' : '')}><h3 className="text-xl font-bold">{String(settings.heading ?? '')}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{String(settings.body ?? '')}</p></section>;
            if (section.type === 'storeos.newsletter.v1') return <section key={section.id} className="px-4 py-6 text-center"><h3 className="text-lg font-bold">{String(settings.heading ?? 'Receba novidades')}</h3><p className="mt-1 text-xs text-slate-500">{String(settings.text ?? '')}</p><div className="mx-auto mt-3 flex max-w-xs gap-2"><span className="flex-1 rounded border px-2 py-1.5 text-left text-xs text-slate-400">Seu e-mail</span><span className="rounded px-3 py-1.5 text-xs font-semibold text-white" style={{ backgroundColor: primary }}>Quero</span></div></section>;
            if (section.type === 'storeos.footer.v1') return <footer key={section.id} className="border-t px-4 py-6 text-xs">
              <p>{String(settings.text ?? '')}</p><p className="mt-2 text-slate-500">{String(globalSettings.footerNote ?? '© Sua loja')}</p>{settings.showNewsletter ? <p className="mt-3 font-semibold">Receba novidades por e-mail</p> : null}
            </footer>;
            return <section key={section.id} className="border-t px-4 py-6"><h3 className="font-semibold">{definition?.title ?? section.type}</h3><p className="mt-1 text-xs text-slate-500">Seção habilitada no layout do tema.</p></section>;
          })()}</div>)}
        </div>
      </div>
    </div>
    <p className="mt-3 text-xs text-slate-500">Clique numa parte da prévia para editar a seção correspondente. Prévia local dos componentes permitidos, sem carregar HTML, scripts ou imagens externas do tema.</p>
  </aside>;
}

function SettingField({ path, name, schema, value, onChange }: { path: string; name: string; schema: FieldSchema; value: JsonValue | undefined; onChange: (value: JsonValue) => void }) {
  const { links, issues } = useContext(FieldContext);
  const issue = issues.get(path);
  const key = path.split('.').pop() ?? '';
  const hint = issue ? <span role="note" className="mt-1 block text-xs font-normal text-amber-800">{issue}</span> : null;
  if (schema.type === 'boolean') return <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={Boolean(value ?? false)} onChange={event => onChange(event.currentTarget.checked)} />{name}{hint}</label>;
  if (schema.enum) return <label className="text-sm font-medium">{name}<select className="input" value={String(value ?? schema.enum[0] ?? '')} onChange={event => onChange(event.currentTarget.value)}>{schema.enum.map((option, index) => <option key={String(option)} value={option}>{schema.enumTitles?.[index] ?? String(option)}</option>)}</select>{hint}</label>;
  if (schema.type === 'integer' || schema.type === 'number') return <label className="text-sm font-medium">{name}<input className="input" type="number" min={schema.minimum} max={schema.maximum} step={schema.type === 'integer' ? 1 : 'any'} value={typeof value === 'number' ? value : ''} onChange={event => { const next = event.currentTarget.value; if (next !== '') onChange(Number(next)); }} />{(schema.minimum !== undefined || schema.maximum !== undefined) && <span className="mt-1 block text-xs font-normal text-slate-500">De {schema.minimum ?? 0} a {schema.maximum ?? '…'}</span>}{hint}</label>;
  const text = typeof value === 'string' ? value : '';
  if (/image(url)?$/i.test(key)) return <ImageField name={name} value={text} onChange={onChange} hint={hint} />;
  if (/(url|href|link)$/i.test(key)) return <LinkField name={name} value={text} links={links} onChange={onChange} hint={hint} />;
  const long = (schema.maxLength ?? 0) > 120 || /^(body|text|description|message)$/i.test(key);
  const counter = schema.maxLength ? <span className={'mt-1 block text-right text-xs font-normal ' + (text.length > schema.maxLength * 0.9 ? 'text-amber-700' : 'text-slate-400')}>{text.length}/{schema.maxLength}</span> : null;
  return <label className={'text-sm font-medium ' + (long ? 'sm:col-span-2' : '')}>{name}{long
    ? <textarea className="input" rows={4} maxLength={schema.maxLength} value={text} onChange={event => onChange(event.currentTarget.value)} />
    : <input className="input" type="text" maxLength={schema.maxLength} value={text} onChange={event => onChange(event.currentTarget.value)} />}{counter}{hint}</label>;
}

function ImageField({ name, value, onChange, hint }: { name: string; value: string; onChange: (value: JsonValue) => void; hint: React.ReactNode }) {
  return <div className="grid min-w-0 gap-2 sm:col-span-2 [&>*]:min-w-0"><span className="text-sm font-medium">{name}</span>
    {value && <div className="flex items-center gap-3 rounded-xl border bg-slate-50 p-2"><img src={value} alt="" className="h-16 w-24 rounded-lg object-cover" /><button type="button" className="text-sm text-slate-500 underline hover:text-red-700" onClick={() => onChange('')}>Remover imagem</button></div>}
    <ImageUploader key={value || 'vazio'} kind="banner" label={value ? 'Trocar imagem' : 'Enviar imagem do computador'} onUploaded={urls => { if (urls[0]) onChange(urls[0]); }} />
    <label className="text-xs text-slate-500">Ou cole o endereço da imagem (https://…)<input type="url" className="input" value={value} onChange={event => onChange(event.currentTarget.value)} /></label>{hint}</div>;
}

/** Escolha de destino por lista (categorias, coleções, páginas). Só quem precisa digita um endereço. */
function LinkField({ name, value, links, onChange, hint }: { name: string; value: string; links: LinkOption[]; onChange: (value: JsonValue) => void; hint: React.ReactNode }) {
  const known = links.some(link => link.href === value);
  const [custom, setCustom] = useState(Boolean(value) && !known);
  const groups = [...new Set(links.map(link => link.group))];
  return <div className="grid gap-1 text-sm font-medium"><label>{name}<select className="input" value={custom ? '__outro' : value} onChange={event => {
    const next = event.currentTarget.value;
    if (next === '__outro') { setCustom(true); return; }
    setCustom(false); onChange(next);
  }}>
    <option value="">Sem link</option>
    {groups.map(group => <optgroup key={group} label={group}>{links.filter(link => link.group === group).map(link => <option key={link.href} value={link.href}>{link.label}</option>)}</optgroup>)}
    <option value="__outro">Outro endereço…</option>
  </select></label>
    {custom && <label className="text-xs font-normal text-slate-500">Endereço (começando com / para páginas da loja, ou https://)<input className="input" type="text" value={value} placeholder="/categorias/vestidos" onChange={event => onChange(event.currentTarget.value)} /></label>}
    {hint}</div>;
}

const AREA: Record<string, string> = { content: 'Conteúdo', accessibility: 'Acessibilidade', seo: 'SEO' };

function CheckList({ checks, dirty }: { checks: ThemeCheckResult | null; dirty: boolean }) {
  if (!checks) return <p className="mt-4 text-sm text-slate-500">Verificando o rascunho…</p>;
  if (checks.failed) return <p className="mt-4 text-sm text-red-700">{checks.failed}</p>;
  const total = checks.errors.length + checks.warnings.length;
  return <details className="mt-4 rounded-lg border p-3 text-sm" open={total > 0 && total <= 6}>
    <summary className="cursor-pointer font-semibold">{total === 0 ? '✓ Verificação: nenhum problema encontrado' : `Verificação: ${checks.errors.length ? `${checks.errors.length} ${checks.errors.length === 1 ? 'erro' : 'erros'}` : ''}${checks.errors.length && checks.warnings.length ? ' e ' : ''}${checks.warnings.length ? `${checks.warnings.length} ${checks.warnings.length === 1 ? 'aviso' : 'avisos'}` : ''}`}{dirty && <span className="ml-2 font-normal text-slate-500">(da última versão salva)</span>}</summary>
    {total > 0 && <ul className="mt-2 grid gap-1.5">
      {checks.errors.map((item, index) => <li key={'e' + index} className="rounded bg-red-50 px-2 py-1 text-red-800"><strong>Erro:</strong> {item.message}</li>)}
      {checks.warnings.map((item, index) => <li key={'w' + index} className="rounded bg-amber-50 px-2 py-1 text-amber-900"><strong>{AREA[item.area] ?? 'Aviso'}:</strong> {item.message}</li>)}
    </ul>}
  </details>;
}
