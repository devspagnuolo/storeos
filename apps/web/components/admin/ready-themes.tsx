import { applyReadyThemeAction } from '../../app/admin/actions';

export type ReadyThemeCard = {
  key: string; name: string; tagline: string; segments: string[];
  accentColor?: string; backgroundColor: string; textColor: string; font: string; buttonRadius: string; sections: string[];
  cardStyle?: string; headingFont?: string; heroTone?: string; mode?: string; heroLayout?: string;
};

const FONT: Record<string, string> = { sans: 'ui-sans-serif, system-ui, sans-serif', serif: 'ui-serif, Georgia, serif', rounded: 'ui-rounded, "Trebuchet MS", system-ui, sans-serif' };
const RADIUS: Record<string, string> = { none: '0', sm: '4px', md: '8px', full: '9999px' };
const SECTION_LABEL: Record<string, string> = { banners: 'Banners', hero: 'Destaque', categories: 'Categorias', products: 'Produtos', benefits: 'Vantagens', testimonials: 'Depoimentos', newsletter: 'Newsletter', text: 'Texto', image: 'Imagem', carousel: 'Carrossel', video: 'Vídeo' };

/** Miniatura desenhada com as cores, a tipografia e o estilo reais do tema (nenhuma imagem externa). */
export function ThemeThumb({ theme }: { theme: ReadyThemeCard }) {
  const accent = theme.accentColor ?? '#5B3DF5';
  const dark = theme.mode === 'dark';
  const cardStyle = theme.cardStyle ?? 'soft';
  const card: React.CSSProperties = cardStyle === 'flat' ? { background: dark ? '#ffffff14' : '#0000000a' } : cardStyle === 'outline' ? { border: `1px solid ${dark ? '#ffffff30' : '#00000022'}` } : cardStyle === 'elevated' ? { background: dark ? '#ffffff10' : '#fff', boxShadow: '0 6px 14px -6px #0006' } : { background: dark ? '#ffffff10' : '#ffffffb3', border: `1px solid ${dark ? '#ffffff20' : '#0000001a'}` };
  const heroBg = theme.heroTone === 'brand' ? accent : theme.heroTone === 'light' ? `${accent}18` : '#111827';
  const heroFg = theme.heroTone === 'light' ? theme.textColor : '#ffffff';
  const centered = theme.heroLayout === 'centered';
  const headingFont = theme.headingFont === 'serif' ? FONT.serif : undefined;
  return <div aria-hidden className="overflow-hidden rounded-xl border" style={{ backgroundColor: theme.backgroundColor, color: theme.textColor, fontFamily: FONT[theme.font] ?? FONT.sans }}>
    <div className="px-3 py-1 text-center text-[10px] font-semibold" style={{ backgroundColor: accent, color: '#fff', textShadow: '0 0 2px #0006' }}>Aviso da loja</div>
    <div className="flex items-center justify-between px-3 py-2 text-[11px] font-bold"><span style={{ fontFamily: headingFont }}>Sua marca</span><span className="opacity-60">Início · Produtos</span></div>
    <div className="mx-3 rounded-lg px-3 py-3" style={{ background: heroBg, color: heroFg, textAlign: centered ? 'center' : 'left' }}>
      <p className="text-sm font-bold leading-tight" style={{ fontFamily: headingFont, letterSpacing: theme.headingFont === 'display' ? '-0.03em' : undefined }}>Título da vitrine</p>
      <p className="mt-1 text-[10px] opacity-75">Texto de apoio da sua loja</p>
      <span className="mt-2 inline-block px-3 py-1 text-[10px] font-semibold" style={{ backgroundColor: theme.heroTone === 'brand' ? '#fff' : accent, color: theme.heroTone === 'brand' ? accent : '#fff', borderRadius: RADIUS[theme.buttonRadius] ?? '8px' }}>Ver produtos</span>
    </div>
    <div className="grid grid-cols-3 gap-1.5 px-3 pb-3 pt-3">{[0, 1, 2].map(i => <div key={i} className="p-1" style={{ ...card, borderRadius: cardStyle === 'outline' ? 4 : cardStyle === 'flat' ? 6 : 10 }}><div className="h-8 rounded" style={{ background: dark ? '#ffffff22' : '#0000001a' }} /><div className="mt-1 h-1.5 w-3/4 rounded" style={{ background: dark ? '#ffffff40' : '#00000033' }} /><div className="mt-1 h-1.5 w-1/2 rounded" style={{ backgroundColor: accent }} /></div>)}</div>
  </div>;
}

export function ReadyThemeGallery({ themes, suggested, back, confirmReplace }: { themes: ReadyThemeCard[]; suggested?: string | null; back?: 'assistente'; confirmReplace?: boolean }) {
  return <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
    {themes.map(theme => <article key={theme.key} className="grid gap-4 rounded-2xl border bg-surface p-4 shadow-sm">
      <ThemeThumb theme={theme} />
      <div>
        <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold">{theme.name}</h3>{suggested && theme.segments.includes(suggested) && <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">Combina com o seu segmento</span>}</div>
        <p className="mt-1 text-sm text-slate-600">{theme.tagline}</p>
        <p className="mt-2 text-xs text-slate-500">Seções: {Array.from(new Set(theme.sections)).map(type => SECTION_LABEL[type] ?? type).join(', ')}</p>
      </div>
      <form action={applyReadyThemeAction}>
        <input type="hidden" name="key" value={theme.key} />
        {back && <input type="hidden" name="back" value={back} />}
        <button className="button w-full" type="submit">Usar este tema</button>
        <p className="mt-2 text-xs text-slate-500">{confirmReplace ? 'Substitui o visual e as seções do rascunho. ' : ''}Vai para o rascunho; o site publicado não muda.</p>
      </form>
    </article>)}
  </div>;
}
