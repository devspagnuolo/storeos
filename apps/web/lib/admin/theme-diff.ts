/**
 * Diferenças entre duas versões de um documento de tema, em frases para a lojista ("Banner principal: Título
 * mudou de “A” para “B”"). Só lê os documentos; quem decide o que mostrar é a tela de comparação.
 */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Section = { id: string; type: string; enabled: boolean; settings: Record<string, Json>; blocks?: { id: string }[] };
export type DiffDocument = {
  templates: Record<string, { sections: Section[] } | undefined>;
  global: { designTokens: Record<string, Record<string, string | number> | undefined>; settings: Record<string, Json> };
};
type Field = { title?: string };
export type DiffManifest = {
  sections: { type: string; title: string; settingsSchema: { properties?: Record<string, Field> } }[];
  globalSettingsSchema?: { properties?: Record<string, Field> };
};
export type ThemeChange = { area: string; text: string };

const TOKEN_LABELS: Record<string, string> = {
  'colors.primary': 'Cor principal', 'colors.background': 'Cor de fundo', 'colors.text': 'Cor do texto',
  'typography.fontFamily': 'Fonte', 'shape.buttonRadius': 'Arredondamento dos botões', 'spacing.section': 'Espaço entre seções',
};
const FONT_LABELS: Record<string, string> = { system: 'Padrão do sistema', 'sans-serif': 'Sem serifa', serif: 'Serifada' };

function show(value: Json | undefined, key = ''): string {
  if (value === undefined || value === null || value === '') return 'vazio';
  if (typeof value === 'boolean') return value ? 'ligado' : 'desligado';
  if (key === 'typography.fontFamily' && typeof value === 'string') return FONT_LABELS[value] ?? value;
  if (typeof value === 'object') return 'conteúdo alterado';
  const text = String(value);
  return text.length > 60 ? `“${text.slice(0, 57)}…”` : typeof value === 'string' ? `“${text}”` : text;
}
const same = (a: Json | undefined, b: Json | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const fieldLabel = (key: string, schema?: Field) => schema?.title ?? key;

export function diffThemeDocuments(before: DiffDocument, after: DiffDocument, manifest: DiffManifest, pageTitle: (pageType: string) => string): ThemeChange[] {
  const changes: ThemeChange[] = [];
  const visual = 'Cores, fonte e marca';
  for (const group of new Set([...Object.keys(before.global.designTokens ?? {}), ...Object.keys(after.global.designTokens ?? {})])) {
    const a = before.global.designTokens[group] ?? {};
    const b = after.global.designTokens[group] ?? {};
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const path = `${group}.${key}`;
      if (!same(a[key], b[key])) changes.push({ area: visual, text: `${TOKEN_LABELS[path] ?? path} mudou de ${show(a[key], path)} para ${show(b[key], path)}` });
    }
  }
  const globals = manifest.globalSettingsSchema?.properties ?? {};
  for (const key of new Set([...Object.keys(before.global.settings), ...Object.keys(after.global.settings)])) {
    if (!same(before.global.settings[key], after.global.settings[key])) changes.push({ area: 'Preferências do tema', text: `${fieldLabel(key, globals[key])} mudou de ${show(before.global.settings[key])} para ${show(after.global.settings[key])}` });
  }

  for (const pageType of new Set([...Object.keys(before.templates), ...Object.keys(after.templates)])) {
    const area = pageTitle(pageType);
    const oldSections = before.templates[pageType]?.sections ?? [];
    const newSections = after.templates[pageType]?.sections ?? [];
    const definition = (type: string) => manifest.sections.find(item => item.type === type);
    const title = (section: Section) => definition(section.type)?.title ?? section.type;
    const oldById = new Map(oldSections.map(section => [section.id, section]));
    const newById = new Map(newSections.map(section => [section.id, section]));
    for (const section of newSections) if (!oldById.has(section.id)) changes.push({ area, text: `Seção “${title(section)}” adicionada` });
    for (const section of oldSections) if (!newById.has(section.id)) changes.push({ area, text: `Seção “${title(section)}” removida` });
    const oldOrder = oldSections.filter(section => newById.has(section.id)).map(section => section.id);
    const newOrder = newSections.filter(section => oldById.has(section.id)).map(section => section.id);
    if (oldOrder.join() !== newOrder.join()) changes.push({ area, text: 'Ordem das seções mudou' });
    for (const section of newSections) {
      const old = oldById.get(section.id);
      if (!old) continue;
      if (old.enabled !== section.enabled) changes.push({ area, text: `Seção “${title(section)}” ${section.enabled ? 'voltou a aparecer' : 'foi ocultada'}` });
      const fields = definition(section.type)?.settingsSchema.properties ?? {};
      for (const key of new Set([...Object.keys(old.settings), ...Object.keys(section.settings)])) {
        if (!same(old.settings[key], section.settings[key])) changes.push({ area, text: `${title(section)}: ${fieldLabel(key, fields[key])} mudou de ${show(old.settings[key])} para ${show(section.settings[key])}` });
      }
      if (!same(old.blocks as Json | undefined, section.blocks as Json | undefined)) changes.push({ area, text: `${title(section)}: itens internos alterados` });
    }
  }
  return changes;
}
