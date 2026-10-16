/**
 * Chave de proteção do Theme Engine (Fase 0).
 *
 * THEME_ENGINE_PILOT_STORES controla quais lojas podem publicar um tema avançado e ter a
 * vitrine desenhada por ele: vazio (padrão) = nenhuma, "*" = todas, ou uma lista de slugs
 * separados por vírgula. Esvaziar a variável devolve na hora todas as lojas ao editor
 * "Personalizar loja" sem apagar instalações, rascunhos ou publicações (rollback).
 */
export function themeEngineEnabledFor(slug: string, raw = process.env.THEME_ENGINE_PILOT_STORES): boolean {
  const list = (raw ?? '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
  return list.includes('*') || list.includes(slug.toLowerCase());
}
