import type { Metadata } from 'next';
import { CartPageView } from '../../components/cart/cart-page-view';
import { getStore } from '../../lib/api';
import { activeEngineDocument, engineFlag, engineSection, engineText } from '../../lib/theme-engine';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Carrinho', robots: { index: false } };

export default async function CartPage() {
  const [engine, store] = await Promise.all([activeEngineDocument(), getStore()]);
  const cart = engineSection(engine, 'cart', 'storeos.cart-summary.v1');
  return <CartPageView heading={engineText(cart?.heading, 'Seu carrinho')} buttonLabel={engineText(cart?.buttonLabel, 'Finalizar compra')} showShipping={engineFlag(cart?.showShippingQuote, true)} freeShipping={store.freeShipping} />;
}
