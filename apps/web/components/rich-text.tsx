import { Fragment } from 'react';
import { parseRichText, type Inline } from '../lib/rich-text';

function Spans({ nodes }: { nodes: Inline[] }) {
  return nodes.map((node, index) => {
    if (node.type === 'link') {
      const external = /^https?:/i.test(node.href);
      return <a key={index} href={node.href} className="font-medium text-brand underline underline-offset-2" {...(external && { target: '_blank', rel: 'noopener noreferrer' })}><Spans nodes={node.children} /></a>;
    }
    let content: React.ReactNode = node.text;
    if (node.italic) content = <em>{content}</em>;
    if (node.bold) content = <strong className="font-semibold text-slate-900">{content}</strong>;
    return <Fragment key={index}>{content}</Fragment>;
  });
}

const Lines = ({ lines }: { lines: Inline[][] }) => lines.map((line, index) => <Fragment key={index}>{index > 0 && <br />}<Spans nodes={line} /></Fragment>);

/** Texto das páginas institucionais (e a prévia no painel), com a formatação de lib/rich-text. */
export function RichText({ source }: { source: string }) {
  return (
    <div className="space-y-4 leading-relaxed text-slate-700">
      {parseRichText(source).map((block, index) => {
        switch (block.type) {
          case 'h2': return <h2 key={index} className="pt-4 text-xl font-bold text-slate-900"><Spans nodes={block.text} /></h2>;
          case 'h3': return <h3 key={index} className="pt-2 text-lg font-semibold text-slate-900"><Spans nodes={block.text} /></h3>;
          case 'ul': return <ul key={index} className="list-disc space-y-1 pl-6">{block.items.map((item, i) => <li key={i}><Spans nodes={item} /></li>)}</ul>;
          case 'ol': return <ol key={index} className="list-decimal space-y-1 pl-6">{block.items.map((item, i) => <li key={i}><Spans nodes={item} /></li>)}</ol>;
          case 'quote': return <blockquote key={index} className="rounded-r-lg border-l-4 border-brand bg-slate-50 px-4 py-3 text-slate-800"><Lines lines={block.lines} /></blockquote>;
          case 'hr': return <hr key={index} className="border-slate-200" />;
          case 'image': return <img key={index} src={block.src} alt={block.alt} loading="lazy" className="mx-auto max-h-[480px] w-auto max-w-full rounded-lg" />;
          default: return <p key={index}><Lines lines={block.lines} /></p>;
        }
      })}
    </div>
  );
}
