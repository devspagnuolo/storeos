export default function Loading() {
  return (
    <main className="shell py-14" aria-busy="true" aria-label="Carregando">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-slate-200" />
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="card h-64 animate-pulse bg-slate-100" />)}
      </div>
    </main>
  );
}
