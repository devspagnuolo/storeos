import Link from 'next/link';
import { Header } from '../components/header';
import { activeEngineDocument, engineSection, engineText } from '../lib/theme-engine';

export default async function NotFound() {
  const page = engineSection(await activeEngineDocument().catch(() => null), 'not-found', 'storeos.not-found.v1');
  return <><Header /><main className="shell py-20 text-center"><h1 className="text-3xl font-bold">{engineText(page?.heading, 'Página não encontrada')}</h1><p className="mt-3 text-slate-500">{engineText(page?.message, 'O endereço pode ter mudado ou o produto não está mais disponível.')}</p><Link href="/categorias" className="button mt-8">{engineText(page?.buttonLabel, 'Ver produtos')}</Link></main></>;
}
