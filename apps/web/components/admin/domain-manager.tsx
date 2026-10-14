'use client';
import { useActionState } from 'react';
import { addDomainAction, primaryDomainAction, removeDomainAction, verifyDomainAction, type FormState } from '../../app/admin/actions';

export type AdminDomain = {
  id: string; hostname: string; status: 'PENDING_DNS' | 'DNS_VERIFIED' | 'ACTIVE' | 'ERROR'; isPrimary: boolean;
  lastCheckedAt: string | null; lastError: string | null; tlsValidUntil: string | null;
  records: { type: string; name: string; value: string; purpose: string }[];
};

const label: Record<AdminDomain['status'], { text: string; tone: string }> = {
  PENDING_DNS: { text: 'Aguardando DNS', tone: 'bg-amber-50 text-amber-800' },
  DNS_VERIFIED: { text: 'DNS ok, aguardando HTTPS', tone: 'bg-amber-50 text-amber-800' },
  ACTIVE: { text: 'Ativo', tone: 'bg-emerald-50 text-emerald-800' },
  ERROR: { text: 'Erro', tone: 'bg-red-50 text-red-700' },
};

function Msg({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="text-sm text-red-700">{state.error}</p>;
  if (state.ok) return <p role="status" className="text-sm text-emerald-700">{state.ok}</p>;
  return null;
}

function Row({ domain }: { domain: AdminDomain }) {
  const [verify, verifyAction, verifying] = useActionState(verifyDomainAction, {});
  const [prim, primaryAction] = useActionState(primaryDomainAction, {});
  const state = label[domain.status];
  return <li className="card p-5">
    <div className="flex flex-wrap items-center gap-3">
      <h3 className="font-semibold">{domain.hostname}</h3>
      <span className={'rounded-full px-2.5 py-0.5 text-xs font-semibold ' + state.tone}>{state.text}</span>
      {domain.isPrimary && <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-brand">Principal</span>}
    </div>
    {domain.status !== 'ACTIVE' && <>
      <p className="mt-3 text-sm text-slate-600">No painel do seu provedor de domínio (Registro.br, GoDaddy, Cloudflare…), crie estes registros DNS:</p>
      <div className="mt-2 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-slate-500"><tr><th className="py-1 pr-4">Tipo</th><th className="py-1 pr-4">Nome</th><th className="py-1">Valor</th></tr></thead>
        <tbody>{domain.records.map(r => <tr key={r.type + r.value} className="border-t"><td className="py-2 pr-4 font-mono">{r.type}</td><td className="py-2 pr-4 break-all font-mono">{r.name}</td><td className="py-2 break-all font-mono">{r.value}</td></tr>)}</tbody></table></div>
      {!domain.records.some(r => r.type !== 'TXT') && <p className="mt-2 text-sm text-amber-800">O destino de apontamento (CNAME/A) ainda não foi configurado no servidor (STOREOS_CNAME_TARGET / STOREOS_EDGE_IPS), então só a verificação de posse é possível por enquanto.</p>}
      {domain.lastError && <p className="mt-3 text-sm text-slate-600">Última verificação: {domain.lastError}</p>}
    </>}
    {domain.status === 'ACTIVE' && domain.tlsValidUntil && <p className="mt-2 text-sm text-slate-500">Certificado válido até {new Date(domain.tlsValidUntil).toLocaleDateString('pt-BR')}.</p>}
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <form action={verifyAction}><input type="hidden" name="id" value={domain.id} /><button disabled={verifying} className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50">{verifying ? 'Verificando…' : 'Verificar agora'}</button></form>
      {domain.status === 'ACTIVE' && !domain.isPrimary && <form action={primaryAction}><input type="hidden" name="id" value={domain.id} /><button className="rounded-lg border px-3 py-2 text-sm font-medium">Tornar principal</button></form>}
      <form action={removeDomainAction} onSubmit={e => { if (!window.confirm('Remover este domínio da loja?')) e.preventDefault(); }}><input type="hidden" name="id" value={domain.id} /><button className="text-sm text-red-700 underline">Remover</button></form>
    </div>
    <div className="mt-2"><Msg state={verify} /><Msg state={prim} /></div>
  </li>;
}

export function DomainManager({ domains, limit }: { domains: AdminDomain[]; limit: number }) {
  const [state, action, pending] = useActionState(addDomainAction, {});
  return <div className="grid gap-6">
    <form action={action} className="card grid gap-3 p-5">
      <label className="text-sm font-medium">Adicionar domínio próprio<input name="hostname" required placeholder="www.minhaloja.com.br" className="input" disabled={domains.length >= limit} /></label>
      <button disabled={pending || domains.length >= limit} className="button justify-self-start disabled:opacity-60">{pending ? 'Cadastrando…' : 'Cadastrar domínio'}</button>
      <Msg state={state} />
    </form>
    {domains.length === 0 ? <p className="text-sm text-slate-500">Nenhum domínio próprio ainda. Enquanto isso, a loja funciona no endereço padrão.</p>
      : <ul className="grid gap-4">{domains.map(domain => <Row key={domain.id} domain={domain} />)}</ul>}
  </div>;
}
