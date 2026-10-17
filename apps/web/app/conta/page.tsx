import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/header';
import { AccountSignal } from '../../components/account/account-signal';
import { LoginForm } from '../../components/account/login-form';
import { FidelizeiCard } from '../../components/account/fidelizei-card';
import { ProfileForm } from '../../components/account/profile-form';
import { accountFetch } from '../../lib/account/session';
import { addressLines, formatDate, statusTone, type AccountOrderSummary, type AccountProfile, type FidelizeiLoyalty } from '../../lib/account/types';
import { formatPrice } from '../../lib/format';
import { logoutAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Minha conta', robots: { index: false } };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ voltar?: string; criar?: string }> }) {
  const query = await searchParams;
  const returnTo = query.voltar === 'checkout' ? 'checkout' : undefined;
  const [profile, orders, fidelizei] = await Promise.all([accountFetch<AccountProfile>('/me'), accountFetch<AccountOrderSummary[]>('/orders'), accountFetch<FidelizeiLoyalty>('/fidelizei').catch(() => null)]);
  if (!profile || !orders) return <><Header /><AccountSignal signedIn={false} /><main className="shell flex justify-center py-10 sm:py-16"><LoginForm key={query.criar ? 'criar' : 'entrar'} returnTo={returnTo} signup={Boolean(query.criar)} /></main></>;

  const open = orders.filter(order => !['DELIVERED', 'CANCELLED', 'REFUNDED', 'RETURNED'].includes(order.status));
  const first = profile.name.trim().split(/\s+/)[0];
  return <>
    <AccountSignal signedIn />
    <Header />
    <main className="shell py-8 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Minha conta</p>
          <h1 className="text-2xl font-bold sm:text-3xl">Olá, {first}!</h1>
        </div>
        <form action={logoutAction}><button className="text-sm font-medium text-slate-500 hover:text-slate-900">Sair</button></form>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Pedidos" value={String(profile.orders)} />
        <Stat label="Em andamento" value={String(open.length)} />
        {fidelizei?.enabled && fidelizei.enrolled && fidelizei.available ? <Stat label="Pontos" value={(fidelizei.balance ?? 0).toLocaleString('pt-BR')} /> : profile.loyalty ? <Stat label="Pontos" value={profile.loyalty.balance.toLocaleString('pt-BR')} hint={profile.loyalty.tier?.name} /> : <Stat label="Cliente desde" value={formatDate(profile.since)} />}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="pedidos">
          <h2 id="pedidos" className="text-lg font-bold">Meus pedidos</h2>
          {orders.length === 0 ? <p className="card mt-3 p-6 text-slate-600">Você ainda não tem pedidos. <Link href="/categorias" className="font-semibold text-brand">Ver produtos</Link></p> : (
            <ul className="mt-3 grid gap-3">
              {orders.map(order => <li key={order.number}>
                <Link href={`/conta/pedidos/${encodeURIComponent(order.number)}`} className="card flex items-center gap-4 p-4 transition hover:border-brand/40 hover:shadow-md">
                  <div className="flex shrink-0 -space-x-3">
                    {order.preview.map((item, index) => item.imageUrl
                      ? <img key={index} src={item.imageUrl} alt="" className="h-12 w-12 rounded-lg border-2 border-white object-cover" />
                      : <span key={index} className="flex h-12 w-12 items-center justify-center rounded-lg border-2 border-white bg-slate-100 text-xs text-slate-400" aria-hidden>✦</span>)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">Pedido {order.number}</p>
                    <p className="text-sm text-slate-500">{formatDate(order.createdAt)} · {order.items} {order.items === 1 ? 'item' : 'itens'} · {formatPrice(order.total)}</p>
                  </div>
                  <span className={`hidden shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 sm:inline ${statusTone(order.status)}`}>{order.statusLabel}</span>
                  <span aria-hidden className="text-slate-400">›</span>
                </Link>
                <span className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-semibold ring-1 sm:hidden ${statusTone(order.status)}`}>{order.statusLabel}</span>
              </li>)}
            </ul>
          )}
        </section>

        <aside className="grid content-start gap-6">
          <section aria-labelledby="dados" className="card p-5">
            <h2 id="dados" className="text-lg font-bold">Meus dados</h2>
            <div className="mt-4"><ProfileForm profile={profile} /></div>
          </section>
          {addressLines(profile.address).length > 0 && <section aria-labelledby="endereco" className="card p-5">
            <h2 id="endereco" className="text-lg font-bold">Endereço de entrega</h2>
            <p className="mt-1 text-xs text-slate-500">Usado na sua última compra. Você pode trocar no checkout.</p>
            <address className="mt-3 text-sm not-italic text-slate-700">{addressLines(profile.address).map(line => <span key={line} className="block">{line}</span>)}</address>
          </section>}
          {fidelizei?.enabled && <FidelizeiCard loyalty={fidelizei} />}
          {/* Com o Fidelizei ligado, ele é o programa de pontos da loja: o programa interno não aparece para não confundir. */}
          {profile.loyalty && !fidelizei?.enabled && <section aria-labelledby="pontos" className="card p-5">
            <h2 id="pontos" className="text-lg font-bold">Meus pontos</h2>
            <p className="mt-2 text-sm text-slate-600">Saldo de <strong>{profile.loyalty.balance.toLocaleString('pt-BR')} pontos</strong>{profile.loyalty.balance >= profile.loyalty.minRedeem ? `, cerca de ${formatPrice(profile.loyalty.balance * profile.loyalty.valuePerPoint)} em desconto` : ''}.</p>
            {profile.loyalty.entries.length > 0 && <ul className="mt-3 divide-y text-sm">{profile.loyalty.entries.map(entry => <li key={entry.id} className="flex justify-between gap-3 py-2"><span className="text-slate-600">{entry.note ?? 'Movimentação'} <span className="text-xs text-slate-400">{formatDate(entry.createdAt)}</span></span><b className={entry.points < 0 ? 'text-slate-500' : 'text-emerald-700'}>{entry.points > 0 ? '+' : ''}{entry.points}</b></li>)}</ul>}
          </section>}
        </aside>
      </div>
    </main>
  </>;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p>{hint && <p className="text-xs text-slate-500">{hint}</p>}</div>;
}
