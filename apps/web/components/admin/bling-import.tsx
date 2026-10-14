'use client';
import { useActionState, useEffect, useState } from 'react';
import { importBlingAction } from '../../app/admin/actions';
import type { BlingImportJob } from '../../lib/admin/types';

/** Botão de importar + barra de andamento (consulta a cada 3 s enquanto roda). */
export function BlingImport({ initial }: { initial: BlingImportJob | null }) {
  const [state, action, pending] = useActionState(importBlingAction, {});
  const [job, setJob] = useState(initial);
  const running = job?.status === 'RUNNING' || (pending || Boolean(state.ok)) && job?.status !== 'DONE';

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      const response = await fetch('/admin/bling/estado', { cache: 'no-store' }).catch(() => undefined);
      if (response?.ok) setJob((await response.json()).import);
    }, 3000);
    return () => clearInterval(timer);
  }, [running]);

  const percent = job && job.total ? Math.round((job.processed / job.total) * 100) : 0;
  return (
    <div>
      <form action={action} className="flex flex-wrap items-center gap-3">
        <button className="button disabled:opacity-60" disabled={pending || job?.status === 'RUNNING'}>{job?.status === 'RUNNING' ? 'Importando…' : 'Importar produtos do Bling'}</button>
        {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
        {state.ok && job?.status !== 'RUNNING' && <p className="text-sm text-emerald-700">{state.ok}</p>}
      </form>
      {job && (
        <div className="mt-4 text-sm">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand transition-all" style={{ width: `${job.status === 'DONE' ? 100 : percent}%` }} /></div>
          <p className="mt-2 text-slate-600">
            {job.status === 'RUNNING' ? `Importando ${job.processed} de ${job.total || '…'} produtos` : job.status === 'DONE' ? 'Última importação concluída' : 'Última importação falhou'}
            {' · '}{job.created} novos, {job.updated} atualizados, {job.failed} com erro
          </p>
          {job.errors.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-red-700">{job.errors.slice(0, 8).map((e, i) => <li key={i}>{e.message}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}
