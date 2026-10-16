import { notFound } from 'next/navigation';
import { Header } from '../header';
import { RichText } from '../rich-text';
import { getPage } from '../../lib/api';
import { activeEngineDocument, engineFlag, engineSection } from '../../lib/theme-engine';

/** Página institucional (/p/…). O texto vem sempre do painel; o tema escolhe largura, título e data de atualização. */
export async function ContentPageView({ slug }: { slug: string }) {
  const page = await getPage(slug);
  if (!page) notFound();
  const settings = engineSection(await activeEngineDocument(), 'page', 'storeos.content-page.v1');
  const wide = settings?.width === 'wide';
  const showTitle = engineFlag(settings?.showTitle, true);
  const showUpdatedAt = engineFlag(settings?.showUpdatedAt, false);
  return (
    <>
      <Header />
      <main className="shell py-12">
        <article className={'mx-auto ' + (wide ? 'max-w-5xl' : 'max-w-3xl')}>
          <h1 className={showTitle ? 'text-3xl font-bold' : 'sr-only'}>{page.title}</h1>
          {showUpdatedAt && <p className="mt-2 text-sm text-slate-500">Atualizada em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' }).format(new Date(page.updatedAt))}</p>}
          <div className={showTitle ? 'mt-6' : ''}><RichText source={page.body} /></div>
        </article>
      </main>
    </>
  );
}
