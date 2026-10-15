import { topBarMessages, type FreeShipping } from '../../lib/top-bar';

/** Faixa no topo de todas as páginas da vitrine (acima do cabeçalho): frete grátis e aviso do lojista. */
export function TopBar({ announcement, freeShipping }: { announcement?: string | null; freeShipping?: FreeShipping | null }) {
  const messages = topBarMessages(announcement, freeShipping);
  if (!messages.length) return null;
  return <div role="note" aria-label="Avisos da loja" className="bg-brand px-4 py-2 text-center text-xs font-medium text-brand-fg sm:text-sm">
    <ul className="flex flex-col items-center justify-center gap-x-6 gap-y-0.5 sm:flex-row sm:flex-wrap">
      {messages.map(message => <li key={message.kind} className="inline-flex items-center gap-2">
        {message.kind === 'shipping' && <TruckIcon />}
        {message.text}
      </li>)}
    </ul>
  </div>;
}

function TruckIcon() {
  return <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.5" /><circle cx="17" cy="17.5" r="1.5" />
  </svg>;
}
