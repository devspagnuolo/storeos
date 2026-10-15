'use client';

import { useState, useTransition } from 'react';
import { saveThemeDraftAction } from '../../app/admin/actions';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type ThemeSection = { id: string; type: string; enabled: boolean; settings: Record<string, JsonValue>; blocks: { id: string; type: string; enabled: boolean; settings: Record<string, JsonValue> }[] };
export type ThemeDocument = {
  schemaVersion: 1;
  themeRelease: string;
  templates: Record<string, { sections: ThemeSection[] }>;
  global: { designTokens: { colors?: Record<string, string>; typography?: Record<string, string | number>; spacing?: Record<string, string | number>; shape?: Record<string, string | number> }; settings: Record<string, JsonValue> };
};
type FieldSchema = { title?: string; type?: string; enum?: (string | number)[]; maxLength?: number; minimum?: number; maximum?: number };
type BlockDefinition = { type: string; title: string; settingsSchema: { properties?: Record<string, FieldSchema> } };\ntype SectionDefinition = { type: string; title: string; description: string; maxBlocks: number; blockTypes: string[]; blockDefinitions?: BlockDefinition[]; settingsSchema: { properties?: Record<string, FieldSchema> }; required?: boolean };
export type ThemeManifest = { displayName: string; version: string; templates: { pageType: string; title: string; required: boolean }[]; sections: SectionDefinition[]; globalSettingsSchema?: { properties?: Record<string, FieldSchema> } };

function labelFor(key: string, schema: FieldSchema) {
  return schema.title ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, value => value.toUpperCase());
}

export function ThemeDraftEditor({ installationId, initialRevision, initialDocument, manifest }: {
  installationId: string;
  initialRevision: number;
  initialDocument: ThemeDocument;
  manifest: ThemeManifest;
}) {
  const [document, setDocument] = useState<ThemeDocument>(() => structuredClone(initialDocument));
  const [revision, setRevision] = useState(initialRevision);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');
  const [dragged, setDragged] = useState<string | null>(null);
  const [previewSize, setPreviewSize] = useState<'desktop' | 'mobile'>('desktop');
  const [saving, startSaving] = useTransition();
  const templateKey = Object.keys(document.templates)[0] ?? 'home';
  const sections = document.templates[templateKey]?.sections ?? [];

  function changeDocument(mutator: (current: ThemeDocument) => ThemeDocument) {
    setDocument(current => mutator(current));
    setDirty(true);
    setNotice('');
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

  function addBlock(sectionId: string, definition: BlockDefinition) {
    const id = crypto.randomUUID();
    const settings = Object.fromEntries(Object.entries(definition.settingsSchema.properties ?? {}).map(([key, schema]) => [
      key,
      schema.type === 'boolean' ? false : schema.type === 'integer' || schema.type === 'number' ? schema.minimum ?? 0 : '',
    ])) as Record<string, JsonValue>;
    updateSection(sectionId, section => section.blocks.length >= (manifest.sections.find(item => item.type === section.type)?.maxBlocks ?? 0)
      ? section
      : { ...section, blocks: [...section.blocks, { id, type: definition.type, enabled: true, settings }] });
  }

  function save() {
    startSaving(async () => {
      const result = await saveThemeDraftAction(installationId, revision, JSON.stringify(document));
      if (result.error) { setNotice(result.error); return; }
      if (result.revision) setRevision(result.revision);
      setDirty(false);
      setNotice(result.ok ?? 'Rascunho salvo.');
    });
  }

  const tokens = document.global.designTokens;
  const colors = tokens.colors ?? {};
  const globalProperties = manifest.globalSettingsSchema?.properties ?? {};

  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_25rem]">
    <div className="grid content-start gap-6">
      <section className="rounded-2xl border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-sm font-semibold text-brand">RASCUNHO DO TEMA</p><h1 className="mt-1 text-2xl font-bold">{manifest.displayName}</h1><p className="mt-1 text-sm text-slate-500">Versão {manifest.version} · revisão {revision}</p></div>
          <button type="button" className="button" disabled={!dirty || saving} onClick={save}>{saving ? 'Salvando…' : 'Salvar rascunho'}</button>
        </div>
        <p role={notice && !dirty ? 'status' : undefined} className={'mt-4 text-sm ' + (notice && !dirty ? 'text-emerald-700' : 'text-slate-600')}>{notice || (dirty ? 'Há alterações não salvas.' : 'Tudo salvo. Este rascunho ainda não altera a loja publicada.')}</p>
      </section>

      <section className="rounded-2xl border bg-surface p-5">
        <div><h2 className="text-lg font-bold">Identidade visual</h2><p className="mt-1 text-sm text-slate-500">A prévia acompanha as cores e a tipografia escolhidas.</p></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
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
            return <SettingField key={key} name={labelFor(key, schema)} schema={schema} value={value} onChange={setValue} />;
          })}</div>}
        </div>
      </section>

      <section className="grid gap-4">
        <div><h2 className="text-lg font-bold">Seções da página inicial</h2><p className="mt-1 text-sm text-slate-500">Reordene por arrastar ou use as setas. Seções ocultas continuam no rascunho.</p></div>
        {sections.map((section, index) => {
          const definition = manifest.sections.find(item => item.type === section.type);
          if (!definition) return null;
          const isRequired = Boolean(definition.required);
          return <article key={section.id} draggable onDragStart={() => setDragged(section.id)} onDragEnd={() => setDragged(null)} onDragOver={event => event.preventDefault()} onDrop={() => {
            if (!dragged) return;
            const from = sections.findIndex(item => item.id === dragged);
            if (from >= 0) moveSection(from, index);
            setDragged(null);
          }} className={'rounded-2xl border bg-surface p-4 ' + (section.enabled ? '' : 'opacity-60 ') + (dragged === section.id ? 'ring-2 ring-brand' : '')}>
            <div className="flex items-center gap-3">
              <span aria-hidden className="cursor-grab select-none text-slate-400" title="Arraste para reordenar">⋮⋮</span>
              <div className="min-w-0 flex-1"><h3 className="font-semibold">{definition.title}</h3><p className="text-xs text-slate-500">{definition.description}</p></div>
              <button type="button" className="rounded border px-2 py-1" aria-label={'Subir ' + definition.title} disabled={index === 0} onClick={() => moveSection(index, index - 1)}>↑</button>
              <button type="button" className="rounded border px-2 py-1" aria-label={'Descer ' + definition.title} disabled={index === sections.length - 1} onClick={() => moveSection(index, index + 1)}>↓</button>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={section.enabled} disabled={isRequired} onChange={event => {
                const enabled = event.currentTarget.checked;
                updateSection(section.id, current => ({ ...current, enabled }));
              }} />Visível</label>
            </div>
            {isRequired && <p className="mt-2 text-xs text-slate-500">Seção estrutural obrigatória do tema.</p>}
            <div className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2">
              {Object.entries(definition.settingsSchema.properties ?? {}).map(([key, schema]) => <SettingField key={key} name={labelFor(key, schema)} schema={schema} value={section.settings[key]} onChange={value => updateSection(section.id, current => ({ ...current, settings: { ...current.settings, [key]: value } }))} />)}
              {!Object.keys(definition.settingsSchema.properties ?? {}).length && <p className="text-sm text-slate-500">Esta seção não tem opções configuráveis nesta versão.</p>}
              {definition.blockDefinitions?.map(blockDefinition => {
                const blockInstances = section.blocks.filter(block => block.type === blockDefinition.type);
                return <div key={blockDefinition.type} className="grid gap-3 border-t pt-4 sm:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-sm font-semibold">{blockDefinition.title}</h4><p className="text-xs text-slate-500">{blockInstances.length} de {definition.maxBlocks} blocos</p></div>
                    <button type="button" className="rounded-lg border px-3 py-2 text-sm font-semibold" disabled={section.blocks.length >= definition.maxBlocks} onClick={() => addBlock(section.id, blockDefinition)}>+ Adicionar bloco</button>
                  </div>
                  {blockInstances.map((block, blockIndex) => <fieldset key={block.id} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
                    <legend className="px-1 text-xs font-medium text-slate-500">{blockDefinition.title} {blockIndex + 1}</legend>
                    {Object.entries(blockDefinition.settingsSchema.properties ?? {}).map(([key, schema]) => <SettingField key={key} name={labelFor(key, schema)} schema={schema} value={block.settings[key]} onChange={value => updateSection(section.id, current => ({ ...current, blocks: current.blocks.map(item => item.id === block.id ? { ...item, settings: { ...item.settings, [key]: value } } : item) }))} />)}
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={block.enabled} onChange={event => { const enabled = event.currentTarget.checked; updateSection(section.id, current => ({ ...current, blocks: current.blocks.map(item => item.id === block.id ? { ...item, enabled } : item) })); }} />Visível</label>
                    <button type="button" className="justify-self-start text-sm font-semibold text-red-700 underline" onClick={() => updateSection(section.id, current => ({ ...current, blocks: current.blocks.filter(item => item.id !== block.id) }))}>Remover bloco</button>
                  </fieldset>)}
                </div>;
              })}
            </div>
          </article>;
        })}
      </section>
    </div>

    <ThemeDraftPreview document={document} manifest={manifest} templateKey={templateKey} previewSize={previewSize} onPreviewSizeChange={setPreviewSize} />
  </div>;
}

function ThemeDraftPreview({ document, manifest, templateKey, previewSize, onPreviewSizeChange }: {
  document: ThemeDocument;
  manifest: ThemeManifest;
  templateKey: string;
  previewSize: 'desktop' | 'mobile';
  onPreviewSizeChange: (size: 'desktop' | 'mobile') => void;
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
      <div><h2 className="font-bold">Prévia do rascunho</h2><p className="mt-1 text-xs text-slate-500">Atualiza enquanto você edita</p></div>
      <div className="flex rounded-lg border p-1" role="group" aria-label="Tamanho da prévia">
        <button type="button" aria-pressed={previewSize === 'desktop'} className={'rounded px-2 py-1 text-xs ' + (previewSize === 'desktop' ? 'bg-slate-900 text-white' : '')} onClick={() => onPreviewSizeChange('desktop')}>Desktop</button>
        <button type="button" aria-pressed={previewSize === 'mobile'} className={'rounded px-2 py-1 text-xs ' + (previewSize === 'mobile' ? 'bg-slate-900 text-white' : '')} onClick={() => onPreviewSizeChange('mobile')}>Celular</button>
      </div>
    </div>
    <p className="my-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Composição demonstrativa do rascunho. Produtos e categorias são exemplos; a vitrine publicada não é alterada.</p>
    <div className="overflow-auto rounded-xl border bg-slate-100 p-2">
      <div className="mx-auto max-h-[70vh] overflow-y-auto rounded-lg border shadow-sm transition-[width] duration-200" style={{ width: previewSize === 'mobile' ? 360 : '100%', maxWidth: '100%' }}>
        <div style={{ color: textColor, backgroundColor: background, fontFamily }}>
          {sections.filter(section => section.enabled).map(section => {
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
                {section.blocks.some(block => block.enabled) && <ul className="mt-4 flex flex-wrap gap-2">{section.blocks.filter(block => block.enabled).map(block => <li key={block.id} className="rounded-full border px-3 py-1 text-xs">{String(block.settings.title ?? '')}{block.settings.text ? ` · ${String(block.settings.text)}` : ''}</li>)}</ul>}
              </div>
              <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed bg-white/70 text-xs text-slate-500">{settings.imageUrl ? 'Imagem do banner configurada' : 'Espaço do banner'}</div>
            </section>;
            if (section.type === 'storeos.category-grid.v1') return <section key={section.id} className="px-4 py-6">
              <h3 className="text-lg font-bold">{String(settings.heading ?? '')}</h3><p className="mb-4 mt-1 text-xs text-slate-500">{String(settings.subheading ?? '')}</p>
              <div className="grid grid-cols-2 gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(2, Math.min(6, Number(settings.columns ?? 4)))}, minmax(0, 1fr))` }}>
                {['Novidades', 'Mais vendidos', 'Vestidos', 'Acessórios'].slice(0, Math.max(2, Math.min(6, Number(settings.columns ?? 4)))).map(category => <div key={category} className="rounded-lg border p-3 text-center text-xs">{category}</div>)}
              </div>
            </section>;
            if (section.type === 'storeos.product-collection.v1') return <section key={section.id} className="px-4 py-6">
              <h3 className="text-lg font-bold">{String(settings.heading ?? '')}</h3><p className="mb-4 mt-1 text-xs text-slate-500">{String(settings.subheading ?? '')}</p>
              <div className="grid grid-cols-2 gap-3">{['Peça em destaque', 'Novidade da coleção'].slice(0, Number(settings.limit ?? 8) > 1 ? 2 : 1).map((product, index) => <div key={product} className="overflow-hidden rounded-lg border">
                <div className="flex aspect-[4/5] items-center justify-center bg-slate-100 text-2xl text-slate-400">◇</div><div className="p-2"><p className="text-xs">{product}</p><p className="mt-1 text-sm font-bold">R$ {index ? '129,90' : '89,90'}</p></div>
              </div>)}</div>
            </section>;
            if (section.type === 'storeos.footer.v1') return <footer key={section.id} className="border-t px-4 py-6 text-xs">
              <p>{String(settings.text ?? '')}</p><p className="mt-2 text-slate-500">{String(globalSettings.footerNote ?? '© Sua loja')}</p>{settings.showNewsletter ? <p className="mt-3 font-semibold">Receba novidades por e-mail</p> : null}
            </footer>;
            return <section key={section.id} className="border-t px-4 py-6"><h3 className="font-semibold">{definition?.title ?? section.type}</h3><p className="mt-1 text-xs text-slate-500">Seção habilitada no layout do tema.</p></section>;
          })}
        </div>
      </div>
    </div>
    <p className="mt-3 text-xs text-slate-500">Prévia local dos componentes permitidos, sem carregar HTML, scripts ou imagens externas do tema.</p>
  </aside>;
}

function SettingField({ name, schema, value, onChange }: { name: string; schema: FieldSchema; value: JsonValue | undefined; onChange: (value: JsonValue) => void }) {
  if (schema.type === 'boolean') return <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={Boolean(value ?? false)} onChange={event => onChange(event.currentTarget.checked)} />{name}</label>;
  if (schema.enum) return <label className="text-sm font-medium">{name}<select className="input" value={String(value ?? schema.enum[0] ?? '')} onChange={event => onChange(event.currentTarget.value)}>{schema.enum.map(option => <option key={String(option)} value={option}>{String(option)}</option>)}</select></label>;
  if (schema.type === 'integer' || schema.type === 'number') return <label className="text-sm font-medium">{name}<input className="input" type="number" min={schema.minimum} max={schema.maximum} step={schema.type === 'integer' ? 1 : 'any'} value={typeof value === 'number' ? value : ''} onChange={event => { const next = event.currentTarget.value; if (next !== '') onChange(Number(next)); }} /></label>;
  const isUrl = /(?:url|href)$/i.test(name);
  return <label className="text-sm font-medium">{name}<input className="input" type={isUrl ? 'url' : 'text'} maxLength={schema.maxLength} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.currentTarget.value)} /></label>;
}
