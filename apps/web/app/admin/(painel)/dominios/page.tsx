import { DomainManager, type AdminDomain } from '../../../../components/admin/domain-manager';
import { adminFetch } from '../../../../lib/admin/session';

export const dynamic = 'force-dynamic';

export default async function DomainsPage() {
  const data = await adminFetch<{ domains: AdminDomain[]; routingConfigured: boolean; limit: number }>('/store/domains');
  return <>
    <p className="text-sm font-semibold text-brand">LOJA ONLINE</p>
    <h1 className="mt-2 text-3xl font-bold">Domínio e publicação</h1>
    <p className="mt-3 max-w-3xl text-slate-600">Use o endereço da sua marca. O domínio só fica ativo depois de provarmos que ele é seu (registro TXT), que aponta para a loja e que o HTTPS responde com certificado válido.</p>
    {!data.routingConfigured && <p role="note" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">O servidor ainda não tem o destino de apontamento configurado, então só a prova de posse pode ser validada.</p>}
    <div className="mt-8"><DomainManager domains={data.domains} limit={data.limit} /></div>
    <p className="mt-6 max-w-3xl text-xs text-slate-500">Cadastrar o domínio aqui também exige adicioná-lo no serviço de hospedagem da loja (certificado HTTPS). Quando o certificado estiver emitido, a verificação muda para Ativo.</p>
  </>;
}
