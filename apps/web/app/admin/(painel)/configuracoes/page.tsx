import { PasswordForm, StoreForm } from '../../../../components/admin/settings-forms';
import { adminFetch, ApiError } from '../../../../lib/admin/session';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  // Sem settings.write o usuário ainda pode trocar a própria senha.
  const store = await adminFetch<{ slug: string; name: string; logoUrl: string | null }>('/store').catch(error => {
    if (error instanceof ApiError && error.status === 403) return null;
    throw error;
  });
  return (
    <>
      <h1 className="text-3xl font-bold">Configurações</h1>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {store && <section className="card p-6"><h2 className="mb-4 text-lg font-bold">Loja</h2><StoreForm store={store} /></section>}
        <section className="card p-6"><h2 className="mb-4 text-lg font-bold">Sua senha</h2><PasswordForm /></section>
      </div>
    </>
  );
}
