'use client';

import { useMemo, useState } from 'react';
import { diffThemeDocuments, type DiffDocument, type DiffManifest } from '../../lib/admin/theme-diff';

const PREVIEW_PAGES: Record<string, string> = { home: 'inicio', landing: 'inicio', category: 'categoria', product: 'produto', search: 'busca', cart: 'carrinho', page: 'conteudo', 'blog-index': 'blog', 'blog-post': 'artigo', 'not-found': 'erro' };
const SHOWN = 30;

/**
 * Compara o rascunho (como está na tela) com a última versão publicada deste tema: lista o que mudou e,
 * sob pedido, mostra as duas prévias reais lado a lado (no celular, uma embaixo da outra).
 */
export function ThemeCompare({ installationId, document, published, manifest, templateKey, pageTitle, dirty }: {
  installationId: string;
  document: DiffDocument;
  published: { version: number; document: DiffDocument } | null;
  manifest: DiffManifest;
  templateKey: string;
  pageTitle: (pageType: string) => string;
  dirty: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [sideBySide, setSideBySide] = useState(false);
  const changes = useMemo(() => published ? diffThemeDocuments(published.document, document, manifest, pageTitle) : [], [published, document, manifest, pageTitle]);
  if (!published) return null;
  const pagina = PREVIEW_PAGES[templateKey] ?? 'inicio';
  const base = `/previa/tema/${encodeURIComponent(installationId)}?pagina=${pagina}`;
  const groups = changes.slice(0, SHOWN).reduce<Record<string, string[]>>((all, change) => ({ ...all, [change.area]: [...(all[change.area] ?? []), change.text] }), {});
  return <section aria-labelledby="comparar" className="rounded-2xl border bg-surface p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 id="comparar" className="text-lg font-bold">Comparar com a versão publicada</h2>
        <p className="mt-1 text-sm text-slate-500">{changes.length ? `${changes.length} ${changes.length === 1 ? 'mudança' : 'mudanças'} em relação à versão ${published.version}, que está guardada como publicada.` : `O rascunho está igual à versão ${published.version} publicada.`}</p>
      </div>
      {changes.length > 0 && <button type="button" className="button-ghost text-sm" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Esconder mudanças' : 'Ver mudanças'}</button>}
    </div>
    {open && <div className="mt-4 grid gap-4">
      {Object.entries(groups).map(([area, texts]) => <div key={area}>
        <h3 className="text-sm font-semibold">{area}</h3>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-700">{texts.map((text, index) => <li key={index} className="break-words">{text}</li>)}</ul>
      </div>)}
      {changes.length > SHOWN && <p className="text-sm text-slate-500">E mais {changes.length - SHOWN} mudanças.</p>}
      <div>
        <button type="button" className="button-ghost text-sm" aria-expanded={sideBySide} onClick={() => setSideBySide(value => !value)}>{sideBySide ? 'Fechar prévias lado a lado' : `Ver “${pageTitle(templateKey)}” lado a lado`}</button>
        {dirty && <p className="mt-2 text-xs text-slate-500">As prévias mostram o rascunho salvo; ele é salvo sozinho em instantes.</p>}
      </div>
      {sideBySide && <div className="grid gap-4 lg:grid-cols-2">
        {([['Publicada (versão ' + published.version + ')', base + '&fonte=publicado'], ['Rascunho', base]] as const).map(([label, src]) => <figure key={label} className="min-w-0">
          <figcaption className="mb-1 text-xs font-semibold text-slate-600">{label}</figcaption>
          <iframe title={label} src={src} className="h-[32rem] w-full rounded-xl border bg-white" loading="lazy" />
        </figure>)}
      </div>}
    </div>}
  </section>;
}
