import type { ThemeDocument } from '@storeos/contracts';

export type ThemeCheck = { path: string; level: 'warning'; area: 'content' | 'accessibility' | 'seo'; message: string };

const HEX = /^#[0-9a-f]{6}$/i;
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
const str = (value: unknown) => typeof value === 'string' ? value.trim() : '';

/**
 * Avisos que não impedem salvar, mas que a lojista deve resolver antes de publicar: conteúdo vazio,
 * contraste abaixo do WCAG AA (4,5:1) e títulos que deixam a página sem cabeçalho principal.
 */
export function themeChecks(document: ThemeDocument): ThemeCheck[] {
  const checks: ThemeCheck[] = [];
  const colors = document.global.designTokens.colors ?? {};
  const text = HEX.test(colors.text ?? '') ? colors.text! : '#0F172A';
  const background = HEX.test(colors.background ?? '') ? colors.background! : '#FFFFFF';
  const primary = HEX.test(colors.primary ?? '') ? colors.primary! : null;
  if (contrast(text, background) < 4.5) checks.push({ path: '$.global.designTokens.colors.text', level: 'warning', area: 'accessibility', message: 'O texto tem pouco contraste com o fundo e fica difícil de ler. Escolha cores mais diferentes.' });
  if (primary && contrast(primary, '#FFFFFF') < 4.5 && contrast(primary, '#111827') < 4.5) checks.push({ path: '$.global.designTokens.colors.primary', level: 'warning', area: 'accessibility', message: 'A cor principal deixa o texto dos botões difícil de ler. Use um tom mais escuro ou mais claro.' });
  if (document.global.settings.showAnnouncement !== false && !str(document.global.settings.announcementText)) checks.push({ path: '$.global.settings.announcementText', level: 'warning', area: 'content', message: 'A barra de aviso está ligada, mas sem mensagem.' });

  for (const [pageType, template] of Object.entries(document.templates)) {
    if (!template) continue;
    let hasMainHeading = false;
    template.sections.forEach((section, index) => {
      if (!section.enabled) return;
      const path = `$.templates.${pageType}.sections[${index}]`;
      const settings = section.settings as Record<string, unknown>;
      if (section.type === 'storeos.hero.v1') {
        if (str(settings.title)) hasMainHeading = true;
        else checks.push({ path: `${path}.settings.title`, level: 'warning', area: 'seo', message: 'O banner principal está sem título. Ele é o título da página para o Google e para leitores de tela.' });
        if (str(settings.ctaLabel) && !str(settings.ctaUrl)) checks.push({ path: `${path}.settings.ctaUrl`, level: 'warning', area: 'content', message: 'O botão do banner está sem link.' });
      }
      if (['storeos.category-grid.v1', 'storeos.product-collection.v1', 'storeos.rich-text.v1'].includes(section.type) && 'heading' in settings && !str(settings.heading)) {
        checks.push({ path: `${path}.settings.heading`, level: 'warning', area: 'accessibility', message: 'Esta seção está sem título; um título ajuda clientes e leitores de tela a se localizarem.' });
      }
      if (section.type === 'storeos.rich-text.v1' && !str(settings.body)) checks.push({ path: `${path}.settings.body`, level: 'warning', area: 'content', message: 'Esta seção de texto está vazia.' });
    });
    if (pageType === 'home' && !hasMainHeading) checks.push({ path: `$.templates.home.sections`, level: 'warning', area: 'seo', message: 'A página inicial não tem um banner com título. Adicione um para dar um título principal à página.' });
  }
  return checks;
}
