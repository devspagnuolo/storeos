/**
 * Contratos versionados do Theme Engine.
 *
 * Os temas descrevem composição e configurações; componentes são fornecidos pelo
 * runtime compilado do STOREOS. Nunca carregar/executar JavaScript de um tema.
 */
export const THEME_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const THEME_DOCUMENT_MAX_BYTES = 262_144;
export const THEME_MAX_SECTIONS_PER_TEMPLATE = 30;
export const THEME_MAX_BLOCKS_PER_SECTION = 40;
export const THEME_MAX_TREE_NODES = 2_000;

export const THEME_PAGE_TYPES = [
  'home',
  'product',
  'category',
  'search',
  'cart',
  'page',
  'blog-index',
  'blog-post',
  'landing',
  'not-found',
] as const;

export type ThemePageType = (typeof THEME_PAGE_TYPES)[number];

/** Tipos públicos são estáveis; releases podem habilitar subconjuntos. */
export const THEME_COMPONENT_TYPES = [
  'storeos.announcement.v1',
  'storeos.header.v1',
  'storeos.footer.v1',
  'storeos.navigation.v1',
  'storeos.hero.v1',
  'storeos.image.v1',
  'storeos.carousel.v1',
  'storeos.rich-text.v1',
  'storeos.benefits.v1',
  'storeos.testimonials.v1',
  'storeos.faq.v1',
  'storeos.newsletter.v1',
  'storeos.video.v1',
  'storeos.category-grid.v1',
  'storeos.product-collection.v1',
  'storeos.product-detail.v1',
  'storeos.search-results.v1',
  'storeos.cart-summary.v1',
  'storeos.blog-list.v1',
  'storeos.blog-post.v1',
  'storeos.content-page.v1',
  'storeos.not-found.v1',
] as const;

export type ThemeComponentType = (typeof THEME_COMPONENT_TYPES)[number];
export type ThemeJsonValue = string | number | boolean | null | ThemeJsonValue[] | { [key: string]: ThemeJsonValue };

export type ThemeBlockInstance = {
  id: string;
  type: string;
  enabled: boolean;
  settings: Record<string, ThemeJsonValue>;
};

export type ThemeSectionInstance = {
  id: string;
  type: ThemeComponentType;
  enabled: boolean;
  settings: Record<string, ThemeJsonValue>;
  blocks: ThemeBlockInstance[];
};

export type ThemeTemplateDocument = {
  sections: ThemeSectionInstance[];
};

export type ThemeDesignTokens = {
  colors?: Record<string, string>;
  typography?: Record<string, string | number>;
  spacing?: Record<string, string | number>;
  shape?: Record<string, string | number>;
  breakpoints?: Record<string, number>;
};

export type ThemeDocument = {
  schemaVersion: typeof THEME_DOCUMENT_SCHEMA_VERSION;
  themeRelease: string;
  templates: Partial<Record<ThemePageType, ThemeTemplateDocument>>;
  global: {
    designTokens: ThemeDesignTokens;
    settings: Record<string, ThemeJsonValue>;
  };
};

export type ThemeTemplateDefinition = {
  pageType: ThemePageType;
  title: string;
  required: boolean;
};

export type ThemeSectionDefinition = {
  type: ThemeComponentType;
  title: string;
  description: string;
  allowedPageTypes: ThemePageType[];
  maxBlocks: number;
  settingsSchema: Record<string, unknown>;
  blockTypes: string[];
  required?: boolean;
};

export type ThemeReleaseManifest = {
  id: string;
  slug: string;
  version: string;
  displayName: string;
  author: { name: string; url?: string };
  license: string;
  minRuntimeVersion: string;
  manifestVersion: 1;
  templates: ThemeTemplateDefinition[];
  sections: ThemeSectionDefinition[];
  globalSettingsSchema: Record<string, unknown>;
  defaultDocument: ThemeDocument;
  assets: Array<{ path: string; sha256: string; mimeType: string; size: number }>;
};

export type ThemeDocumentIssue = {
  path: string;
  code:
    | 'INVALID_OBJECT'
    | 'INVALID_SCHEMA_VERSION'
    | 'RELEASE_MISMATCH'
    | 'UNKNOWN_TEMPLATE'
    | 'MISSING_REQUIRED_TEMPLATE'
    | 'INVALID_SECTION'
    | 'DUPLICATE_ID'
    | 'SECTION_LIMIT'
    | 'BLOCK_LIMIT'
    | 'UNKNOWN_COMPONENT'
    | 'COMPONENT_NOT_ALLOWED'
    | 'UNSAFE_PROPERTY'
    | 'UNSAFE_URL'
    | 'DOCUMENT_TOO_LARGE'
    | 'TREE_TOO_COMPLEX';
  message: string;
};

const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor', 'html', 'rawhtml', 'script', 'javascript']);
const knownPageTypes = new Set<string>(THEME_PAGE_TYPES);
const knownComponentTypes = new Set<string>(THEME_COMPONENT_TYPES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 96 && /^[a-zA-Z0-9_-]+$/.test(value);
}

function isSafeUrl(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  if (/^(javascript|vbscript|file):/.test(normalized)) return false;
  if (normalized.startsWith('data:')) return /^data:image\/(png|jpeg|webp|gif);base64,/.test(normalized);
  if (normalized.startsWith('//')) return false;
  if (normalized.startsWith('/') || normalized.startsWith('#') || normalized.startsWith('?')) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Valida o shape do documento contra os limites da plataforma e do release.
 * A validação completa dos settings por JSON Schema é feita pelo serviço da API
 * com os schemas do manifesto; esta camada impede tipos, URLs e estruturas perigosas.
 */
export function validateThemeDocument(input: unknown, manifest: ThemeReleaseManifest): ThemeDocumentIssue[] {
  const issues: ThemeDocumentIssue[] = [];
  let serialized: string;
  try {
    serialized = JSON.stringify(input);
  } catch {
    return [{ path: '$', code: 'INVALID_OBJECT', message: 'O documento não é serializável.' }];
  }

  if (new TextEncoder().encode(serialized).byteLength > THEME_DOCUMENT_MAX_BYTES) {
    return [{ path: '$', code: 'DOCUMENT_TOO_LARGE', message: 'O layout excede o limite permitido.' }];
  }

  let nodeCount = 0;
  const inspect = (value: unknown, path: string): void => {
    nodeCount++;
    if (nodeCount > THEME_MAX_TREE_NODES) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => inspect(item, `${path}[${index}]`));
      return;
    }
    if (!isRecord(value)) {
      if (typeof value === 'string' && /(?:url|href|src)$/i.test(path.split('.').at(-1) ?? '') && !isSafeUrl(value)) {
        issues.push({ path, code: 'UNSAFE_URL', message: 'Use uma URL HTTPS ou um caminho da própria loja.' });
      }
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenKeys.has(key.toLowerCase())) {
        issues.push({ path: `${path}.${key}`, code: 'UNSAFE_PROPERTY', message: 'Este campo não é permitido em temas.' });
      }
      inspect(child, `${path}.${key}`);
    }
  };

  if (!isRecord(input)) {
    return [{ path: '$', code: 'INVALID_OBJECT', message: 'O layout precisa ser um objeto.' }];
  }

  inspect(input, '$');
  if (nodeCount > THEME_MAX_TREE_NODES) {
    issues.push({ path: '$', code: 'TREE_TOO_COMPLEX', message: 'O layout possui elementos demais.' });
  }

  if (input.schemaVersion !== THEME_DOCUMENT_SCHEMA_VERSION) {
    issues.push({ path: '$.schemaVersion', code: 'INVALID_SCHEMA_VERSION', message: 'A versão do layout não é compatível.' });
  }
  if (input.themeRelease !== `${manifest.slug}@${manifest.version}`) {
    issues.push({ path: '$.themeRelease', code: 'RELEASE_MISMATCH', message: 'O layout e o tema instalado não correspondem.' });
  }

  const templates = isRecord(input.templates) ? input.templates : {};
  const allowedTemplates = new Set(manifest.templates.map(template => template.pageType));
  const requiredTemplates = manifest.templates.filter(template => template.required);
  for (const template of requiredTemplates) {
    if (!Object.hasOwn(templates, template.pageType)) {
      issues.push({ path: `$.templates.${template.pageType}`, code: 'MISSING_REQUIRED_TEMPLATE', message: 'Este tema exige um template para esta página.' });
    }
  }
  for (const [pageType, value] of Object.entries(templates)) {
    const path = `$.templates.${pageType}`;
    if (!knownPageTypes.has(pageType) || !allowedTemplates.has(pageType as ThemePageType)) {
      issues.push({ path, code: 'UNKNOWN_TEMPLATE', message: 'O tema não oferece este tipo de página.' });
      continue;
    }
    if (!isRecord(value) || !Array.isArray(value.sections)) {
      issues.push({ path, code: 'INVALID_OBJECT', message: 'O template precisa conter uma lista de seções.' });
      continue;
    }
    if (value.sections.length > THEME_MAX_SECTIONS_PER_TEMPLATE) {
      issues.push({ path: `${path}.sections`, code: 'SECTION_LIMIT', message: 'O template excede o limite de seções.' });
    }

    const ids = new Set<string>();
    for (const [index, rawSection] of value.sections.entries()) {
      const sectionPath = `${path}.sections[${index}]`;
      if (!isRecord(rawSection)) {
        issues.push({ path: sectionPath, code: 'INVALID_SECTION', message: 'A seção está malformada.' });
        continue;
      }
      if (!validId(rawSection.id)) {
        issues.push({ path: `${sectionPath}.id`, code: 'INVALID_SECTION', message: 'A seção precisa de um identificador válido.' });
      } else if (ids.has(rawSection.id)) {
        issues.push({ path: `${sectionPath}.id`, code: 'DUPLICATE_ID', message: 'Identificadores de seção devem ser únicos no template.' });
      } else {
        ids.add(rawSection.id);
      }
      if (typeof rawSection.type !== 'string' || !knownComponentTypes.has(rawSection.type)) {
        issues.push({ path: `${sectionPath}.type`, code: 'UNKNOWN_COMPONENT', message: 'Este componente não pertence ao runtime do STOREOS.' });
        continue;
      }
      const definition = manifest.sections.find(section => section.type === rawSection.type);
      if (!definition || !definition.allowedPageTypes.includes(pageType as ThemePageType)) {
        issues.push({ path: `${sectionPath}.type`, code: 'COMPONENT_NOT_ALLOWED', message: 'Este componente não está habilitado neste template.' });
      }
      if (!Array.isArray(rawSection.blocks)) {
        issues.push({ path: `${sectionPath}.blocks`, code: 'INVALID_SECTION', message: 'A seção precisa conter uma lista de blocos.' });
      } else {
        const maxBlocks = Math.min(definition?.maxBlocks ?? 0, THEME_MAX_BLOCKS_PER_SECTION);
        if (rawSection.blocks.length > maxBlocks) {
          issues.push({ path: `${sectionPath}.blocks`, code: 'BLOCK_LIMIT', message: 'A seção excede o limite de blocos.' });
        }
      }
    }
  }

  return issues;
}

export function isThemeDocumentValid(input: unknown, manifest: ThemeReleaseManifest): input is ThemeDocument {
  return validateThemeDocument(input, manifest).length === 0;
}
