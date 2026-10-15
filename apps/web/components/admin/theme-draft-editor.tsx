'use client';

import { useState, useTransition } from 'react';
import { saveThemeDraftAction } from '../../app/admin/actions';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type ThemeSection = { id: string; type: string; enabled: boolean; settings: Record<string, JsonValue>; blocks: { id: string; type: string; enabled: boolean; settings: Record<string, JsonValue> }[] };
type ThemeDocument = {
  schemaVersion: 1;
  themeRelease: string;
  templates: Record<string, { sections: ThemeSection[] }>;
  global: { designTokens: { colors?: Record<string, string>; typography?: Record<string, string | number>; spacing?: Record<string, string | number>; shape?: Record<string, string | number> }; settings: Record<string, JsonValue> };
};
type FieldSchema = { title?: string; type?: string; enum?: (string | number)[]; maxLength?: number; minimum?: number; maximum?: number };
type SectionDefinition = { type: string; title: string; description: string; settingsSchema: { properties?: Record<string, FieldSchema> }; required?: boolean };
type ThemeManifest = { displayName: string; version: string; templates: { pageType: string; title: string; required: boolean }[]; sections: SectionDefinition[] };

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
  const globalSchema = manifest as ThemeManifest & { globalSettingsSchema?: { properties?: Record<string, FieldSchema> } };
  const globalProperties = globalSchema.globalSettingsSchema?.properties ?? {};

  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
    <div className="grid content-start gap-6">
      <section className="rounded-2xl border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-sm font-semibold text-brand">RASCUNHO DO TEMA</p><h1 className="mt-1 text-2xl font-bold">{manifest.displayName}</h1><p className="mt-1 text-sm text-slate-500">Versão {manifest.version} · revisão {revision}</p></div>
          <button type="button" className="button" disabled={!dirty || saving} onClick={save}>{saving ? 'Salvando…' : 'Salvar rascunho'}</button>
        </div>
        <p role={notice && !dirty ? 'status' : undefined} className={'mt-4 text-sm ' + (notice && !dirty ? 'text-emerald-700' : 'text-slate-600')}>{notice || (dirty ? 'Há alterações não salvas.' : 'Tudo salvo. Este rascunho ainda não altera a loja publicada.')}</p>
      </section>

      <section className="rounded-2xl border bg-surface p-5">
        <div><h2 className="text-lg font-bold">Identidade visual</h2><p className="mt-1 text-sm text-slate-500">Cores e tipografia são tokens do tema e poderão ser aplicados pelo renderizador.</p></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {([['primary', 'Cor principal', '#6D28D9'], ['background', 'Fundo', '#FFFFFF'], ['text', 'Texto', '#0F172A']] as const).map(([key, label, fallback]) =>
            <label key={key} className="flex items-center gap-3 text-sm font-medium">{label}<input aria-label={label} type="color" value={colors[key] ?? fallback} onChange={event => changeDocument(current => ({ ...current, global: { ...current.global, designTokens: { ...current.global.designTokens, colors: { ...current.global.designTokens.colors, [key]: event.currentTarget.value.toUpperCase() } } } }))} className="h-10 w-14 rounded border p-1" /></label>
          )}
          <label className="text-sm font-medium">Família tipográfica<select className="input" value={String(tokens.typography?.fontFamily ?? 'system')} onChange={event => changeDocument(current => ({ ...current, global: { ...current.global, designTokens: { ...current.global.designTokens, typography: { ...current.global.designTokens.typography, fontFamily: event.currentTarget.value } } } }))}>
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
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={section.enabled} onChange={event => updateSection(section.id, current => ({ ...current, enabled: event.currentTarget.checked }))} />Visível</label>
            </div>
            <div className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2">
              {Object.entries(definition.settingsSchema.properties ?? {}).map(([key, schema]) => <SettingField key={key} name={labelFor(key, schema)} schema={schema} value={section.settings[key]} onChange={value => updateSection(section.id, current => ({ ...current, settings: { ...current.settings, [key]: value } }))} />)}
              {!Object.keys(definition.settingsSchema.properties ?? {}).length && <p className="text-sm text-slate-500">Esta seção não tem opções configuráveis nesta versão.</p>}
              {section.blocks.length > 0 && <p className="text-xs text-slate-500 sm:col-span-2">Os blocos deste tema serão editáveis quando o manifesto declarar seus campos para o editor.</p>}
            </div>
          </article>;
        })}
      </section>
    </div>

    <aside className="h-fit rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 xl:sticky xl:top-20">
      <h2 className="font-bold">Prévia e publicação</h2>
      <p className="mt-2">Este editor salva os dados do novo Theme Engine, mas o preview e a vitrine pública ainda usam o formato atual. Por segurança, não há opção de publicar aqui.</p>
      <p className="mt-3">Para alterar o site que seus clientes veem hoje, use o personalizador atual.</p>
      <a className="mt-3 inline-block font-semibold underline" href="/painel/site">Abrir personalizador atual</a>
    </aside>
  </div>;
}

function SettingField({ name, schema, value, onChange }: { name: string; schema: FieldSchema; value: JsonValue | undefined; onChange: (value: JsonValue) => void }) {
  if (schema.type === 'boolean') return <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={Boolean(value ?? false)} onChange={event => onChange(event.currentTarget.checked)} />{name}</label>;
  if (schema.enum) return <label className="text-sm font-medium">{name}<select className="input" value={String(value ?? schema.enum[0] ?? '')} onChange={event => onChange(event.currentTarget.value)}>{schema.enum.map(option => <option key={String(option)} value={option}>{String(option)}</option>)}</select></label>;
  if (schema.type === 'integer' || schema.type === 'number') return <label className="text-sm font-medium">{name}<input className="input" type="number" min={schema.minimum} max={schema.maximum} step={schema.type === 'integer' ? 1 : 'any'} value={typeof value === 'number' ? value : ''} onChange={event => { const next = event.currentTarget.value; if (next !== '') onChange(Number(next)); }} /></label>;
  const isUrl = /(?:url|href)$/i.test(name);
  return <label className="text-sm font-medium">{name}<input className="input" type={isUrl ? 'url' : 'text'} maxLength={schema.maxLength} value={typeof value === 'string' ? value : ''} onChange={event => onChange(event.currentTarget.value)} /></label>;
}
