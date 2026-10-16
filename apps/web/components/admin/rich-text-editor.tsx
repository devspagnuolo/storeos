'use client';
import { useRef, useState } from 'react';
import { RichText } from '../rich-text';

type Edit = { text: string; start: number; end: number };

/** Envolve a seleção (ou um texto de exemplo) com marcadores, ex.: **negrito**. */
function wrap({ text, start, end }: Edit, before: string, after: string, sample: string): Edit {
  const selected = text.slice(start, end) || sample;
  const next = text.slice(0, start) + before + selected + after + text.slice(end);
  return { text: next, start: start + before.length, end: start + before.length + selected.length };
}

/** Aplica um prefixo a cada linha selecionada (título, lista, destaque); repetir o botão tira o prefixo. */
function prefixLines({ text, start, end }: Edit, prefix: (index: number) => string, pattern: RegExp): Edit {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = text.indexOf('\n', end) === -1 ? text.length : text.indexOf('\n', end);
  const lines = text.slice(lineStart, lineEnd).split('\n');
  const all = lines.every(line => pattern.test(line));
  const changed = lines.map((line, index) => (all ? line.replace(pattern, '') : prefix(index) + line.replace(/^(#{2,3}\s+|[-*]\s+|\d+[.)]\s+|>\s?)/, ''))).join('\n');
  return { text: text.slice(0, lineStart) + changed + text.slice(lineEnd), start: lineStart, end: lineStart + changed.length };
}

/** Insere um bloco inteiro em linha própria, com linha em branco antes e depois. */
function insertBlock({ text, start }: Edit, block: string): Edit {
  const before = text.slice(0, start).replace(/\n*$/, '');
  const after = text.slice(start).replace(/^\n*/, '');
  const head = before ? `${before}\n\n` : '';
  const next = `${head}${block}${after ? `\n\n${after}` : '\n'}`;
  const cursor = head.length + block.length;
  return { text: next, start: cursor, end: cursor };
}

const Tool = ({ label, title, onClick, className = '' }: { label: React.ReactNode; title: string; onClick: () => void; className?: string }) => (
  <button type="button" title={title} aria-label={title} onMouseDown={e => e.preventDefault()} onClick={onClick} className={`min-w-9 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-200 ${className}`}>{label}</button>
);

/**
 * Editor do texto das páginas: barra de formatação (negrito, itálico, títulos, listas, destaque, link, imagem e divisória),
 * atalhos Ctrl+B / Ctrl+I / Ctrl+K e prévia ao lado mostrando a página como a cliente vai ver.
 * O conteúdo continua sendo texto simples com marcações, então nada de HTML chega à loja.
 */
export function RichTextEditor({ name, defaultValue = '', maxLength = 20000 }: { name: string; defaultValue?: string; maxLength?: number }) {
  const area = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const apply = (change: (edit: Edit) => Edit) => {
    const el = area.current;
    if (!el) return;
    const result = change({ text: value, start: el.selectionStart, end: el.selectionEnd });
    setValue(result.text);
    setTab('write');
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(result.start, result.end); });
  };
  const bold = () => apply(edit => wrap(edit, '**', '**', 'texto em negrito'));
  const italic = () => apply(edit => wrap(edit, '*', '*', 'texto em itálico'));
  const link = () => {
    const href = window.prompt('Endereço do link (ex.: https://wa.me/5511999999999 ou /p/trocas)');
    if (href?.trim()) apply(edit => wrap(edit, '[', `](${href.trim()})`, 'texto do link'));
  };
  const image = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true); setError('');
    try {
      const form = new FormData();
      form.append('files', file, file.name);
      const response = await fetch('/admin/midia/upload?kind=other', { method: 'POST', body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.files?.[0]?.url) throw new Error(body.message || 'Não foi possível enviar a imagem.');
      const alt = file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').replace(/[[\]]/g, '');
      apply(edit => insertBlock(edit, `![${alt}](${body.files[0].url})`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (picker.current) picker.current.value = '';
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'b') { e.preventDefault(); bold(); }
    if (key === 'i') { e.preventDefault(); italic(); }
    if (key === 'k') { e.preventDefault(); link(); }
  };

  return (
    <div className="rounded-xl border border-slate-300 bg-white focus-within:border-brand">
      <div role="toolbar" aria-label="Formatação do texto" className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 p-1.5">
        <Tool label={<b>N</b>} title="Negrito (Ctrl+B)" onClick={bold} />
        <Tool label={<i className="font-serif">I</i>} title="Itálico (Ctrl+I)" onClick={italic} />
        <span className="mx-1 h-5 w-px bg-slate-300" aria-hidden />
        <Tool label="Título" title="Título" onClick={() => apply(edit => prefixLines(edit, () => '## ', /^##\s+/))} className="font-semibold" />
        <Tool label="Subtítulo" title="Subtítulo" onClick={() => apply(edit => prefixLines(edit, () => '### ', /^###\s+/))} />
        <span className="mx-1 h-5 w-px bg-slate-300" aria-hidden />
        <Tool label="• Lista" title="Lista com marcadores" onClick={() => apply(edit => prefixLines(edit, () => '- ', /^[-*]\s+/))} />
        <Tool label="1. Lista" title="Lista numerada" onClick={() => apply(edit => prefixLines(edit, index => `${index + 1}. `, /^\d+[.)]\s+/))} />
        <Tool label="❝ Destaque" title="Destaque (caixa com borda)" onClick={() => apply(edit => prefixLines(edit, () => '> ', /^>\s?/))} />
        <span className="mx-1 h-5 w-px bg-slate-300" aria-hidden />
        <Tool label="🔗 Link" title="Link (Ctrl+K)" onClick={link} />
        <Tool label={uploading ? 'Enviando…' : '🖼 Imagem'} title="Inserir imagem do computador" onClick={() => picker.current?.click()} />
        <Tool label="― Linha" title="Linha divisória" onClick={() => apply(edit => insertBlock(edit, '---'))} />
        <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => void image(e.currentTarget.files)} />
        <div className="ml-auto flex rounded-md bg-slate-200 p-0.5 text-xs lg:hidden">
          {(['write', 'preview'] as const).map(option => (
            <button key={option} type="button" onClick={() => setTab(option)} className={`rounded px-2.5 py-1 font-medium ${tab === option ? 'bg-white shadow-sm' : 'text-slate-600'}`}>{option === 'write' ? 'Escrever' : 'Visualizar'}</button>
          ))}
        </div>
      </div>
      <div className="grid lg:grid-cols-2">
        <textarea
          ref={area} name={name} value={value} onChange={e => setValue(e.target.value)} onKeyDown={onKeyDown} required maxLength={maxLength} rows={18}
          aria-label="Conteúdo da página" placeholder="Escreva o texto da página. Selecione um trecho e use os botões acima para formatar."
          className={`min-h-[22rem] w-full resize-y rounded-bl-xl border-0 bg-transparent p-4 font-mono text-sm leading-relaxed outline-none lg:block lg:border-r lg:border-slate-200 ${tab === 'write' ? 'block' : 'hidden'}`}
        />
        <div className={`max-h-[36rem] min-h-[22rem] overflow-y-auto p-4 lg:block ${tab === 'preview' ? 'block' : 'hidden'}`}>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Prévia</p>
          {value.trim() ? <RichText source={value} /> : <p className="text-sm text-slate-400">A prévia aparece aqui enquanto você escreve.</p>}
        </div>
      </div>
      <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
        <span>{error ? <span role="alert" className="text-red-700">{error}</span> : 'Linha em branco separa parágrafos. Enter simples quebra a linha.'}</span>
        <span>{value.length.toLocaleString('pt-BR')} / {maxLength.toLocaleString('pt-BR')}</span>
      </div>
    </div>
  );
}
