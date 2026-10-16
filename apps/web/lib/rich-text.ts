export type Inline = { type: 'text'; text: string; bold?: boolean; italic?: boolean } | { type: 'link'; href: string; children: Inline[] };
export type Block =
  | { type: 'h2' | 'h3'; text: Inline[] }
  | { type: 'p' | 'quote'; lines: Inline[][] }
  | { type: 'ul' | 'ol'; items: Inline[][] }
  | { type: 'image'; src: string; alt: string }
  | { type: 'hr' };

/** Links aceitos: páginas da própria loja, http(s), e-mail, telefone e WhatsApp. Qualquer outro esquema (javascript:, data:) vira texto. */
export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^\/(?!\/)/.test(href) || /^#[\w-]*$/.test(href)) return href;
  if (/^(https?:\/\/|mailto:|tel:)[^\s<>"']+$/i.test(href)) return href;
  return null;
}

const INLINE = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Negrito (**texto**), itálico (*texto*) e link ([texto](endereço)). Nunca interpreta HTML: o React escapa tudo ao renderizar. */
export function parseInline(source: string, style: { bold?: boolean; italic?: boolean } = {}): Inline[] {
  const out: Inline[] = [];
  const push = (text: string) => { if (text) out.push({ type: 'text', text, ...(style.bold && { bold: true }), ...(style.italic && { italic: true }) }); };
  let last = 0;
  for (const match of source.matchAll(INLINE)) {
    push(source.slice(last, match.index));
    last = match.index! + match[0].length;
    if (match[1] !== undefined) out.push(...parseInline(match[1], { ...style, bold: true }));
    else if (match[2] !== undefined) out.push(...parseInline(match[2], { ...style, italic: true }));
    else {
      const href = safeHref(match[4]);
      if (href) out.push({ type: 'link', href, children: parseInline(match[3], style) });
      else push(match[0]);
    }
  }
  push(source.slice(last));
  return out;
}

const IMAGE = /^!\[([^\]]*)\]\((https:\/\/[^)\s]+)\)$/;

/**
 * Converte o texto das páginas em blocos. Cada linha que começa com "## " é título, "### " subtítulo, "- " item de lista,
 * "1. " item numerado, "> " destaque, "---" linha divisória e ![descrição](https://…) imagem.
 * Linhas seguidas formam um parágrafo (com quebra de linha); linha em branco separa parágrafos.
 */
export function parseRichText(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n').map(line => line.trimEnd());
  const last = () => blocks.at(-1);
  let open = false; // o bloco anterior ainda aceita a próxima linha (parágrafo, lista ou destaque)
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { open = false; continue; }
    const heading = /^(#{2,3})\s+(.+)$/.exec(trimmed);
    if (heading) { blocks.push({ type: heading[1].length === 2 ? 'h2' : 'h3', text: parseInline(heading[2].trim()) }); open = false; continue; }
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) { blocks.push({ type: 'hr' }); open = false; continue; }
    const image = IMAGE.exec(trimmed);
    if (image) { blocks.push({ type: 'image', alt: image[1].trim(), src: image[2] }); open = false; continue; }
    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    const numbered = /^\d+[.)]\s+(.+)$/.exec(trimmed);
    const listType = bullet ? 'ul' : numbered ? 'ol' : null;
    if (listType) {
      const item = parseInline((bullet ?? numbered)![1].trim());
      const prev = last();
      if (open && prev?.type === listType) prev.items.push(item);
      else blocks.push({ type: listType, items: [item] });
      open = true;
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(trimmed);
    if (quote) {
      const prev = last();
      if (open && prev?.type === 'quote') prev.lines.push(parseInline(quote[1]));
      else blocks.push({ type: 'quote', lines: [parseInline(quote[1])] });
      open = true;
      continue;
    }
    const prev = last();
    if (open && prev?.type === 'p') prev.lines.push(parseInline(trimmed));
    else blocks.push({ type: 'p', lines: [parseInline(trimmed)] });
    open = true;
  }
  return blocks;
}
