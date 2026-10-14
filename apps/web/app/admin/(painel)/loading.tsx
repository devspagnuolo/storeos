import { Skeleton } from '../../../components/ui/skeleton';

export default function PanelLoading() {
  return (
    <div aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-8 w-64" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
      <Skeleton className="mt-8 h-72" />
    </div>
  );
}
