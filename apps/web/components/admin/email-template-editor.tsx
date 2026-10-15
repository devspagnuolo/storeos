'use client';
import { useActionState, useState } from 'react';
import { previewEmailTemplateAction, restoreEmailTemplateAction, saveEmailTemplateAction, type TemplateFormState } from '../../app/admin/actions';
import type { EmailTemplateRow } from '../../lib/admin/types';

/** Edita assunto e mensagem de um e-mail, mostra como fica e permite desligar ou voltar ao padrão. */
export function EmailTemplateEditor({ template }: { template: EmailTemplateRow }) {
  const [saveState, save, saving] = useActionState<TemplateFormState, FormData>(saveEmailTemplateAction, {});
  const [previewState, preview, previewing] = useActionState<TemplateFormState, FormData>(previewEmailTemplateAction, {});
  const [restoreState, restore, restoring] = useActionState<TemplateFormState, FormData>(restoreEmailTemplateAction, {});
  const [open, setOpen] = useState(false);
  const message = previewState.error ?? saveState.error ?? restoreState.error;
  const ok = restoreState.ok ?? saveState.ok;
  return (
    <section className="card p-5 text-sm">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left" aria-expanded={open}>
        <span><strong>{template.label}</strong> <span className="text-slate-500">· {template.description}</span></span>
        <span className="whitespace-nowrap text-xs text-slate-500">{!template.enabled ? 'Desligado' : template.customized ? 'Personalizado' : 'Padrão'}</span>
      </button>
      {open && (
        <form action={save} className="mt-4 space-y-3">
          <input type="hidden" name="key" value={template.key} />
          <label className="block font-medium">Assunto<input name="subject" defaultValue={template.subject} required maxLength={150} className="input" /></label>
          <label className="block font-medium">Mensagem<textarea name="body" defaultValue={template.body} required maxLength={2000} rows={8} className="input font-mono" /></label>
          <p className="text-xs text-slate-500">
            Variáveis: {template.variables.map(v => <code key={v.name} title={v.description} className="mr-1 rounded bg-slate-100 px-1">{`{{${v.name}}}`}</code>)}
            Linha cuja variável estiver vazia some sozinha. A saudação e a assinatura da loja são sempre incluídas.
          </p>
          <label className="flex items-center gap-2"><input type="checkbox" name="enabled" defaultChecked={template.enabled} /> Enviar este e-mail</label>
          <div className="flex flex-wrap gap-3">
            <button className="button disabled:opacity-60" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
            <button type="submit" formAction={preview} className="rounded-xl border px-4 py-2 disabled:opacity-60" disabled={previewing}>{previewing ? 'Montando…' : 'Ver como fica'}</button>
            {template.customized && <button type="submit" formAction={restore} formNoValidate className="px-2 py-2 text-slate-600 underline disabled:opacity-60" disabled={restoring}>Voltar ao padrão</button>}
          </div>
          {message && <p role="alert" className="text-red-700">{message}</p>}
          {ok && <p role="status" className="text-emerald-700">{ok}</p>}
          {previewState.preview && (
            <div className="rounded-xl border bg-white p-3">
              <p className="text-xs text-slate-500">Assunto: <strong>{previewState.preview.subject}</strong> (dados de exemplo)</p>
              <iframe title={`Prévia: ${template.label}`} sandbox="" srcDoc={previewState.preview.html} className="mt-2 h-72 w-full rounded border" />
            </div>
          )}
        </form>
      )}
    </section>
  );
}
