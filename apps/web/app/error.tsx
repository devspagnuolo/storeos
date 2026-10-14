'use client';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="shell py-20 text-center">
      <h1 className="text-3xl font-bold">Algo deu errado</h1>
      <p className="mt-3 text-slate-500">Não foi possível carregar esta página agora. Tente novamente em instantes.</p>
      <button type="button" onClick={reset} className="button mt-8">Tentar de novo</button>
    </main>
  );
}
