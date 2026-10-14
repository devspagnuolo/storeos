'use client';

export default function PanelError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-lg p-10 text-center">
      <h1 className="text-xl font-bold">Não foi possível carregar esta tela</h1>
      <p className="mt-2 text-sm text-slate-500">Pode ser uma instabilidade momentânea. Tente novamente; se continuar, recarregue a página.</p>
      <button type="button" onClick={reset} className="button mt-6">Tentar de novo</button>
    </div>
  );
}
