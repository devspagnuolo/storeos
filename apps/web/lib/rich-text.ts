export type Block = { type: 'h2' | 'h3' | 'p'; text: string } | { type: 'ul'; items: string[] };

/**
 * Converte o texto simples das páginas em blocos: "## " vira título, "### " subtítulo, linhas com "- " viram lista
 * e o resto vira parágrafo. Nunca interpreta HTML: o React escapa tudo ao renderizar.
 */
export function parseRichText(source: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of source.replace(/\r\n/g, '\n').split(/\n{2,}/)) {
    const lines = chunk.split('\n').map(line => line.trimEnd()).filter(Boolean);
    if (!lines.length) continue;
    if (lines.every(line => line.startsWith('- '))) { blocks.push({ type: 'ul', items: lines.map(line => line.slice(2).trim()) }); continue; }
    if (lines.length === 1 && lines[0].startsWith('### ')) { blocks.push({ type: 'h3', text: lines[0].slice(4).trim() }); continue; }
    if (lines.length === 1 && lines[0].startsWith('## ')) { blocks.push({ type: 'h2', text: lines[0].slice(3).trim() }); continue; }
    blocks.push({ type: 'p', text: lines.join(' ') });
  }
  return blocks;
}
