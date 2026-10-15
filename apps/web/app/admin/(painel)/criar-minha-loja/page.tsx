import Link from 'next/link';
import { StoreForm } from '../../../../components/admin/settings-forms';
import { ReadyThemeGallery, type ReadyThemeCard } from '../../../../components/admin/ready-themes';
import { adminFetch } from '../../../../lib/admin/session';
import { storeBaseDomain } from '../../../../lib/store-host';
import type { StorefrontState, StoreSetup } from '../../../../lib/admin/storefront';
import { BusinessProfileForm, LaunchCard } from '../primeiros-passos/setup-forms';

export const dynamic = 'force-dynamic';

type Store = { slug: string; name: string; logoUrl: string | null };

export default async function StoreAssistantPage({ searchParams }: { searchParams: Promise<{ tema?: string; erro?: string }> }) {
  const [setup, profile, store, themes, storefront, params] = await Promise.all([
    adminFetch<StoreSetup>('/store/setup'),
    adminFetch<Record<string, string | undefined>>('/onboarding/profile'),
    adminFetch<Store>('/store'),
    adminFetch<ReadyThemeCard[]>('/store/storefront/themes'),
    adminFetch<StorefrontState>('/store/storefront'),
    searchParams,
  ]);
  const done = (id: string) => setup.steps.find(step => step.id === id)?.complete ?? false;
  const hasHome = (config: unknown) => Boolean((config as { home?: { sections?: unknown[] } } | null)?.home?.sections?.length);
  const steps = [
    { id: 'marca', title: 'Sua marca', complete: Boolean(profile.segment) && done('identity') },
    { id: 'tema', title: 'Tema da vitrine', complete: hasHome(storefront.draft) || hasHome(storefront.published) },
    { id: 'produtos', title: 'Produtos', complete: done('catalog') },
    { id: 'entrega', title: 'Pagamento e entrega', complete: done('shipping') && done('payment') },
    { id: 'publicar', title: 'Revisar e publicar', complete: setup.open },
  ];
  const current = steps.findIndex(step => !step.complete);
  const chosen = params.tema ? themes.find(theme => theme.key === params.tema) : undefined;

  return <>
    <p className="text-sm font-semibold uppercase tracking-wider text-brand">Assistente</p>
    <h1 className="mt-2 text-3xl font-bold">Criar minha loja, passo a passo</h1>
    <p className="mt-3 max-w-2xl text-slate-600">Marca, tema e produtos em uma só sequência. Você pode sair e voltar quando quiser: o que já foi feito fica salvo e nada vai ao ar antes do último passo.</p>

    <ol className="mt-6 flex flex-wrap gap-2" aria-label="Etapas">
      {steps.map((step, index) => <li key={step.id}><a href={'#' + step.id} className={'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ' + (step.complete ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : index === current ? 'border-violet-300 bg-violet-50 text-brand' : 'text-slate-500')}>
        <span aria-hidden>{step.complete ? '✓' : index + 1}</span>{step.title}<span className="sr-only">{step.complete ? ' — concluído' : index === current ? ' — próximo' : ''}</span>
      </a></li>)}
    </ol>

    {params.erro && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{params.erro}</p>}

    <section id="marca" className="card mt-8 p-6">
      <h2 className="text-xl font-bold">1. Sua marca</h2>
      <p className="mt-1 text-sm text-slate-600">Nome e logo aparecem no topo da loja, nos e-mails e na aba do navegador. O segmento ajuda a sugerir o tema.</p>
      <div className="mt-4"><StoreForm store={store} /></div>
      <BusinessProfileForm profile={profile} />
    </section>

    <section id="tema" className="mt-8">
      <h2 className="text-xl font-bold">2. Escolha o tema</h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">Cada tema já vem com cores, tipografia e as seções da página inicial, de categoria e de produto. Você troca textos, imagens e produtos depois.</p>
      {chosen && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Tema “{chosen.name}” aplicado ao rascunho. Siga para os produtos; depois você ajusta tudo em <Link className="font-semibold underline" href="/painel/site">Personalizar loja</Link>.</p>}
      <div className="mt-4"><ReadyThemeGallery themes={themes} suggested={profile.segment} back="assistente" confirmReplace={steps[1].complete} /></div>
    </section>

    <section id="produtos" className="card mt-8 p-6">
      <h2 className="text-xl font-bold">3. Cadastre ou importe os produtos</h2>
      <p className="mt-1 text-sm text-slate-600">{setup.steps.find(step => step.id === 'catalog')?.description}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link className="button" href="/painel/produtos/novo">Cadastrar um produto</Link>
        <Link className="button-ghost" href="/painel/produtos/importar">Importar planilha</Link>
        <Link className="button-ghost" href="/painel/bling#importar">Importar do Bling</Link>
      </div>
      <p className="mt-3 text-sm text-slate-500">Depois, em Personalizar loja, você escolhe quais produtos aparecem em cada seção.</p>
    </section>

    <section id="entrega" className="card mt-8 p-6">
      <h2 className="text-xl font-bold">4. Pagamento e entrega</h2>
      <ul className="mt-3 grid gap-2 text-sm">
        {(['payment', 'shipping'] as const).map(id => { const step = setup.steps.find(item => item.id === id); return step && <li key={id} className="flex flex-wrap items-center justify-between gap-3"><span><span aria-hidden>{step.complete ? '✓ ' : '○ '}</span><strong>{step.title}</strong> <span className="text-slate-500">{step.description}</span></span><Link className="button-ghost" href={step.href}>{step.complete ? 'Revisar' : 'Configurar'}</Link></li>; })}
      </ul>
    </section>

    <section id="publicar" className="mt-8">
      <h2 className="text-xl font-bold">5. Revisar e publicar</h2>
      <div className="mt-3 flex flex-wrap gap-3"><Link className="button-ghost" href="/painel/site">Ajustar a vitrine no editor</Link><Link className="button-ghost" href="/painel/primeiros-passos">Ver tudo o que falta</Link></div>
      <LaunchCard open={setup.open} blockers={setup.launchBlockers} />
      {storeBaseDomain() ? <p className="mt-3 text-sm text-slate-600">Endereço da sua loja, sem precisar de domínio próprio: <strong>https://{store.slug}.{storeBaseDomain()}</strong>. Quando tiver um domínio da sua marca, cadastre em <Link className="font-semibold text-brand underline" href="/painel/dominios">Domínio e publicação</Link>.</p> : <p className="mt-3 text-sm text-slate-500">Para a loja aparecer em um endereço da sua marca, cadastre o domínio em <Link className="font-semibold text-brand underline" href="/painel/dominios">Domínio e publicação</Link>.</p>}
      <p className="mt-3 text-sm text-slate-500">Para a vitrine publicada aparecer, publique o visual em Personalizar loja e abra a loja aqui.</p>
    </section>
  </>;
}
