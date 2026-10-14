import type { HomeSection, StorefrontConfig } from './api';
import { SECTION_CATALOG } from './storefront-model';

const name = (section: HomeSection) => SECTION_CATALOG[section.type]?.label ?? section.type;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Resume em português o que muda entre duas versões (de `before` para `after`), para a tela de histórico. */
export function diffConfigs(before: StorefrontConfig, after: StorefrontConfig): string[] {
  const lines: string[] = [];
  const a = before.home?.sections ?? [], b = after.home?.sections ?? [];
  if (!before.home && !after.home) { /* ambas no layout padrão */ }
  else if (!before.home) lines.push('Página inicial personalizada com seções');
  else if (!after.home) lines.push('Volta ao layout padrão da página inicial');
  const ids = new Set(a.map(s => s.id));
  for (const s of b) if (!ids.has(s.id)) lines.push(`Seção adicionada: ${name(s)}`);
  const bIds = new Set(b.map(s => s.id));
  for (const s of a) if (!bIds.has(s.id)) lines.push(`Seção removida: ${name(s)}`);
  for (const s of b) {
    const old = a.find(x => x.id === s.id);
    if (!old) continue;
    if (old.hidden !== s.hidden) lines.push(`${name(s)}: ${s.hidden ? 'ocultada' : 'exibida'}`);
    if (!same(old.props, s.props)) lines.push(`${name(s)}: conteúdo alterado`);
  }
  const common = a.filter(s => bIds.has(s.id)).map(s => s.id), commonAfter = b.filter(s => ids.has(s.id)).map(s => s.id);
  if (!same(common, commonAfter)) lines.push('Ordem das seções alterada');
  const labels: Record<string, string> = { preset: 'Tema', font: 'Tipografia', buttonRadius: 'Botões', containerWidth: 'Largura', spacing: 'Espaçamento', logoUrl: 'Logo', faviconUrl: 'Favicon', backgroundColor: 'Cor de fundo', textColor: 'Cor do texto' };
  for (const [key, label] of Object.entries(labels)) {
    const x = (before.design as Record<string, unknown> | undefined)?.[key], y = (after.design as Record<string, unknown> | undefined)?.[key];
    if (!same(x ?? null, y ?? null)) lines.push(`${label} alterado`);
  }
  if ((before.accentColor ?? null) !== (after.accentColor ?? null)) lines.push('Cor de destaque alterada');
  if ((before.announcementText ?? '') !== (after.announcementText ?? '')) lines.push('Faixa de aviso alterada');
  const legacy = ['heroTitle', 'heroDescription', 'heroCta', 'heroImageUrl'] as const;
  if (legacy.some(k => (before[k] ?? null) !== (after[k] ?? null))) lines.push('Destaque principal alterado');
  return lines;
}
