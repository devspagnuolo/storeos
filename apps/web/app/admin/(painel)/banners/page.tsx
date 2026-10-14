import { BannerForm } from '../../../../components/admin/banner-form';
import { WhatsappForm } from '../../../../components/admin/whatsapp-form';
import { formatDateTime } from '../../../../lib/admin/labels';
import { adminFetch } from '../../../../lib/admin/session';
import type { AdminBanner } from '../../../../lib/admin/types';
import { deleteBannerAction, toggleBannerAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function BannersPage() {
  const [banners, whatsapp] = await Promise.all([
    adminFetch<AdminBanner[]>('/engagement/admin/banners'),
    adminFetch<{ whatsappNumber: string | null; whatsappMessage: string | null }>('/engagement/admin/whatsapp'),
  ]);
  const now = Date.now();
  const status = (b: AdminBanner) => !b.active ? 'Desativado' : b.startsAt && new Date(b.startsAt).getTime() > now ? `Agendado para ${formatDateTime(b.startsAt)}` : b.endsAt && new Date(b.endsAt).getTime() <= now ? 'Encerrado' : 'No ar';
  return (
    <>
      <h1 className="text-3xl font-bold">Banners e WhatsApp</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">Os banners formam o carrossel do topo da página inicial, na ordem abaixo. Sem banners, a loja mostra a apresentação padrão. Use imagens largas (por exemplo 1920 × 700) e uma versão vertical para o celular.</p>

      <section className="card mt-6 p-6"><h2 className="mb-4 text-lg font-bold">Botão de WhatsApp</h2><WhatsappForm number={whatsapp.whatsappNumber} message={whatsapp.whatsappMessage} /></section>

      <section className="card mt-6 p-6"><h2 className="mb-4 text-lg font-bold">Novo banner</h2><BannerForm /></section>

      <div className="mt-6 space-y-4">
        {banners.map(banner => (
          <details key={banner.id} className="card p-5">
            <summary className="flex cursor-pointer flex-wrap items-center gap-4">
              <img src={banner.imageUrl} alt="" className="h-16 w-32 rounded object-cover" />
              <span className="font-semibold">{banner.title || 'Sem título'}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${status(banner) === 'No ar' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{status(banner)}</span>
              <span className="text-xs text-slate-400">ordem {banner.position}</span>
            </summary>
            <div className="mt-4"><BannerForm banner={banner} />
              <div className="mt-3 flex gap-4 text-xs">
                <form action={toggleBannerAction}><input type="hidden" name="id" value={banner.id} /><input type="hidden" name="active" value={String(!banner.active)} /><button className="underline">{banner.active ? 'Desativar' : 'Ativar'}</button></form>
                <form action={deleteBannerAction}><input type="hidden" name="id" value={banner.id} /><button className="text-red-700 underline">Excluir banner</button></form>
              </div>
            </div>
          </details>))}
        {!banners.length && <p className="card p-8 text-center text-slate-500">Nenhum banner ainda.</p>}
      </div>
    </>
  );
}
