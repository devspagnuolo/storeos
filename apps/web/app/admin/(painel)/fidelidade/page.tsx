import { LoyaltyConfigForm } from '../../../../components/admin/loyalty-config-form';
import { adminFetch } from '../../../../lib/admin/session';
import type { LoyaltyConfig } from '../../../../lib/admin/types';
import { resetLoyaltyConfigAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function LoyaltyPage() {
  const config = await adminFetch<LoyaltyConfig>('/loyalty/config');
  return (
    <>
      <h1 className="text-3xl font-bold">Fidelidade (pontos)</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">Defina quanto o cliente ganha a cada compra paga, quanto cada ponto vale em cupom e os níveis (Prata, Ouro, Diamante) com bônus de pontos. Se a compra for devolvida, os pontos voltam. O saldo de cada cliente aparece na ficha dele, em Clientes.</p>
      <section className="card mt-6 p-6"><LoyaltyConfigForm config={config} /></section>
      {config.customized && (
        <form action={resetLoyaltyConfigAction} className="mt-4"><button className="text-sm text-slate-500 underline">Voltar às regras padrão</button></form>
      )}
    </>
  );
}
