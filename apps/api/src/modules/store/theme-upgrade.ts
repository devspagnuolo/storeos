import type { ThemeDocument, ThemeJsonValue, ThemeReleaseManifest, ThemeSectionInstance } from '@storeos/contracts';

/** Compara versões semânticas simples (1.10.0 > 1.9.0). */
export function compareVersions(a: string, b: string) {
  const left = a.split('.').map(part => Number.parseInt(part, 10) || 0);
  const right = b.split('.').map(part => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

type Schema = { properties?: Record<string, unknown> };

/**
 * Leva o rascunho de uma versão do tema para a versão nova sem perder o trabalho da lojista: mantém cores,
 * textos, ordem e seções ainda existentes; descarta só campos e seções que a versão nova não aceita; campos
 * novos recebem o padrão da versão nova; páginas que não existiam entram com o layout inicial dela.
 */
export function upgradeThemeDocument(current: ThemeDocument, target: ThemeReleaseManifest): ThemeDocument {
  const defaults = target.defaultDocument;
  const sectionDefinition = (type: string) => target.sections.find(section => section.type === type);
  const defaultSettings = (pageType: string, section: ThemeSectionInstance) => {
    const sameId = defaults.templates[pageType as keyof ThemeDocument['templates']]?.sections.find(item => item.id === section.id && item.type === section.type);
    const sameType = Object.values(defaults.templates).flatMap(template => template?.sections ?? []).find(item => item.type === section.type);
    return (sameId ?? sameType)?.settings ?? {};
  };
  const pick = (settings: Record<string, ThemeJsonValue>, schema: Schema, fallback: Record<string, ThemeJsonValue>) => {
    const allowed = Object.keys(schema.properties ?? {});
    const next: Record<string, ThemeJsonValue> = {};
    for (const key of allowed) {
      if (Object.hasOwn(settings, key)) next[key] = settings[key];
      else if (Object.hasOwn(fallback, key)) next[key] = fallback[key];
    }
    return next;
  };
  const templates: ThemeDocument['templates'] = {};
  for (const template of target.templates) {
    const pageType = template.pageType;
    const existing = current.templates[pageType];
    if (!existing) {
      const fresh = defaults.templates[pageType];
      if (fresh) templates[pageType] = structuredClone(fresh);
      continue;
    }
    templates[pageType] = {
      sections: existing.sections
        .filter(section => sectionDefinition(section.type)?.allowedPageTypes.includes(pageType))
        .map(section => {
          const definition = sectionDefinition(section.type)!;
          const blockTypes = new Set(definition.blockTypes);
          return {
            ...section,
            settings: pick(section.settings, definition.settingsSchema as Schema, defaultSettings(pageType, section)),
            blocks: section.blocks.filter(block => blockTypes.has(block.type)).slice(0, definition.maxBlocks),
          };
        }),
    };
  }
  return {
    schemaVersion: current.schemaVersion,
    themeRelease: `${target.slug}@${target.version}`,
    templates,
    global: {
      designTokens: structuredClone(current.global.designTokens),
      settings: pick(current.global.settings, target.globalSettingsSchema as Schema, defaults.global.settings),
    },
  };
}
