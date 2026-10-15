'use client';
import { useActionState } from 'react';
import { addRedirectAction, generateNuvemshopRedirectsAction, importRedirectsAction } from '../../app/admin/actions';

function Feedback({ state }: { state: { error?: string; ok?: string } }) {
  return <>{state.error && <p role="alert" className="mt-2 text-sm text-red-700">{state.error}</p>}{state.ok && <p role="status" className="mt-2 text-sm text-emerald-700">{state.ok}</p>}</>;
}

export function RedirectForms() {
  const [added, add, adding] = useActionState(addRedirectAction, {});
  const [imported, importFile, importing] = useActionState(importRedirectsAction, {});
  const [generated, generate, generating] = useActionState(generateNuvemshopRedirectsAction, {});
  return (
    <div className="space-y-6">
      <section className="card p-6">
        <h2 className="text-lg font-bold">Se você veio da Nuvemshop</h2>
        <p className="mt-1 text-sm text-slate-500">Cria de uma vez os endereços de produto (/produtos/nome) e de categoria (/nome) no formato da Nuvemshop, levando para a página equivalente nesta loja. Só funciona se os nomes de endereço dos produtos forem os mesmos.</p>
        <form action={generate} className="mt-3"><button className="button disabled:opacity-60" disabled={generating}>{generating ? 'Criando…' : 'Criar endereços da Nuvemshop'}</button></form>
        <Feedback state={generated} />
      </section>
      <section className="card p-6">
        <h2 className="text-lg font-bold">Novo redirecionamento</h2>
        <form action={add} className="mt-3 grid gap-3 text-sm sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="font-medium">Endereço antigo<input name="from" required className="input" placeholder="/produtos/vestido-azul" /></label>
          <label className="font-medium">Leva para<input name="to" required className="input" placeholder="/produto/vestido-azul" /></label>
          <button className="button disabled:opacity-60" disabled={adding}>{adding ? 'Salvando…' : 'Salvar'}</button>
        </form>
        <p className="mt-2 text-xs text-slate-500">Pode colar o endereço completo antigo; a loja usa só o caminho. O destino é um caminho desta loja (começa com /) ou um endereço https.</p>
        <Feedback state={added} />
      </section>
      <section className="card p-6">
        <h2 className="text-lg font-bold">Enviar planilha</h2>
        <p className="mt-1 text-sm text-slate-500">Arquivo CSV com duas colunas: endereço antigo e endereço novo (a primeira linha pode ser o título). Até 5000 linhas.</p>
        <form action={importFile} className="mt-3 flex flex-wrap items-center gap-3 text-sm"><input type="file" name="file" accept=".csv,text/csv,text/plain" required /><button className="button disabled:opacity-60" disabled={importing}>{importing ? 'Enviando…' : 'Enviar'}</button></form>
        <Feedback state={imported} />
      </section>
    </div>
  );
}
