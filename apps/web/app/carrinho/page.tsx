import { CartPageView } from '../../components/cart/cart-page-view';
import { activeEngineDocument, engineFlag, engineSection, engineText } from '../../lib/theme-engine';

export const dynamic = 'force-dynamic';

export default async function CartPage() {
  const cart = engineSection(await activeEngineDocument(), 'cart', 'storeos.cart-summary.v1');
  return <CartPageView heading={engineText(cart?.heading, 'Seu carrinho')} buttonLabel={engineText(cart?.buttonLabel, 'Finalizar compra')} showShipping={engineFlag(cart?.showShippingQuote, true)} />;
}
