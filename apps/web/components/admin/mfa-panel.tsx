'use client';
import { useActionState, useState, useTransition } from 'react';
import { mfaDisableAction, mfaEnableAction, mfaSetupAction, type MfaState } from '../../app/admin/actions';

export function MfaPanel({ enabled, recoveryCodesLeft }: { enabled: boolean; recoveryCodesLeft: number }) {
  const [setup, setSetup] = useState<MfaState>({});
  const [pendingSetup, startSetup] = useTransition();
  const [enableState, enable, enabling] = useActionState(mfaEnableAction, {});
  const [disableState, disable, disabling] = useActionState(mfaDisableAction, {});

  if (enableState.recoveryCodes) return (
    <div>
      <p className="text-sm text-emerald-700">{enableState.ok}</p>
      <p className="mt-3 text-sm">Guarde estes códigos de recuperação em um lugar seguro. Cada um funciona uma única vez e não serão mostrados de novo.</p>
      <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">{enableState.recoveryCodes.map(code => <li key={code} className="rounded-lg bg-slate-100 px-3 py-2">{code}</li>)}</ul>
    </div>
  );
  if (enabled) return (
    <form action={disable}>
      <p className="text-sm text-emerald-700">Ativada. Códigos de recuperação restantes: {recoveryCodesLeft}.</p>
      <label className="mt-4 block text-sm font-medium">Senha<input name="password" type="password" required className="input" autoComplete="current-password" /></label>
      <label className="mt-3 block text-sm font-medium">Código atual ou de recuperação<input name="code" required className="input" autoComplete="one-time-code" /></label>
      {disableState.error && <p role="alert" className="mt-3 text-sm text-red-700">{disableState.error}</p>}
      {disableState.ok && <p className="mt-3 text-sm text-emerald-700">{disableState.ok}</p>}
      <button className="button-ghost mt-4 disabled:opacity-60" disabled={disabling}>Desativar</button>
    </form>
  );
  if (!setup.secret) return (
    <div>
      <p className="text-sm text-slate-600">Peça um código do seu aplicativo autenticador (Google Authenticator, Authy, 1Password…) a cada login.</p>
      {setup.error && <p role="alert" className="mt-3 text-sm text-red-700">{setup.error}</p>}
      <button className="button mt-4 disabled:opacity-60" disabled={pendingSetup} onClick={() => startSetup(async () => setSetup(await mfaSetupAction()))}>Configurar</button>
    </div>
  );
  return (
    <form action={enable}>
      <p className="text-sm">Leia o QR code no aplicativo e digite o código de 6 dígitos.</p>
      <img src={setup.qr} alt="QR code para o aplicativo autenticador" width={192} height={192} className="mt-3 rounded-lg border" />
      <p className="mt-2 text-xs text-slate-500">Sem câmera? Chave manual: <span className="font-mono">{setup.secret}</span></p>
      <label className="mt-4 block text-sm font-medium">Código<input name="code" required inputMode="numeric" maxLength={6} className="input" autoComplete="one-time-code" /></label>
      {enableState.error && <p role="alert" className="mt-3 text-sm text-red-700">{enableState.error}</p>}
      <button className="button mt-4 disabled:opacity-60" disabled={enabling}>Ativar</button>
    </form>
  );
}
