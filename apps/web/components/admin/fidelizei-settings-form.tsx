'use client';
import { useActionState } from 'react';
import { saveFidelizeiAction, testFidelizeiAction } from '../../app/admin/actions';
import type { FidelizeiSettings } from '../../lib/admin/types';

/** Chave da API (nunca mostrada de volta), liga/desliga e textos de adesão do programa. */
export function FidelizeiSettingsForm({ settings }: { settings: FidelizeiSettings }) {
  const [state, action, pending] = useActionState(saveFidelizeiAction, {});
  const [testState, test, testing] = useActionState(testFidelizeiAction, {});
  return (
    <div>
      <form action={action} className="grid gap-4">
        <label className="text-sm font-medium">Chave da API do Fidelizei
          <input name="apiKey" type="password" autoComplete="off" spellCheck={false} placeholder={settings.keyHint ? `Em uso: ${settings.keyHint} (cole outra para trocar)` : 'fz_live_...'} className="input mt-1 w-full font-mono" />
          <span className="mt-1 block text-xs font-normal text-slate-500">No Fidelizei: Integrações → Chaves da API → Nova chave → StoreOS. A chave fica guardada criptografada e não aparece de novo aqui.</span>
        </label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={settings.connected ? settings.enabled : true} /> Mostrar o programa na loja (adesão, pontos e benefícios no checkout)</label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Link dos termos do programa
            <input name="termsUrl" type="url" defaultValue={settings.termsUrl ?? ''} placeholder="https://..." className="input mt-1 w-full" />
          </label>
          <label className="text-sm font-medium">Versão dos termos
            <input name="termsVersion" defaultValue={settings.termsVersion} className="input mt-1 w-full" />
          </label>
          <label className="text-sm font-medium">Link da política de privacidade
            <input name="privacyUrl" type="url" defaultValue={settings.privacyUrl ?? ''} placeholder="https://..." className="input mt-1 w-full" />
          </label>
          <label className="text-sm font-medium">Versão da política
            <input name="privacyVersion" defaultValue={settings.privacyVersion} className="input mt-1 w-full" />
          </label>
        </div>
        <p className="text-xs text-slate-500">A cliente aceita estes documentos ao aderir; o Fidelizei registra as versões aceitas. Mude a versão quando o texto mudar.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button className="button disabled:opacity-60" disabled={pending}>{pending ? 'Salvando…' : settings.connected ? 'Salvar' : 'Conectar ao Fidelizei'}</button>
          {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
          {state.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
        </div>
      </form>
      {settings.connected && <form action={test} className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4">
        <button className="button-ghost disabled:opacity-60" disabled={testing}>{testing ? 'Testando…' : 'Testar conexão'}</button>
        {testState.error && <p role="alert" className="text-sm text-red-700">{testState.error}</p>}
        {testState.ok && <p className="text-sm text-emerald-700">{testState.ok}</p>}
      </form>}
    </div>
  );
}
