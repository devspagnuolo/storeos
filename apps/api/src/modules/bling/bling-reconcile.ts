/** Conferência entre o catálogo do Bling (sistema principal) e o da loja. Tudo puro: sem rede nem banco. */
export type BlingItem = { sku: string; name: string; price: number; stock: number; active: boolean };
export type SiteItem = { sku: string; name: string; price: number; stock: number; reserved: number; active: boolean; productId: string; variantId: string | null };

export type Reconciliation = {
  onlyInBling: BlingItem[];
  onlyOnSite: { sku: string; name: string }[];
  stock: { sku: string; name: string; bling: number; site: number; reserved: number; productId: string; variantId: string | null }[];
  price: { sku: string; name: string; bling: number; site: number }[];
  summary: { bling: number; site: number; matched: number; inSync: number };
};

const key = (sku: string) => sku.trim().toLowerCase();
const cents = (value: number) => Math.round(value * 100);

export function reconcile(bling: BlingItem[], site: SiteItem[]): Reconciliation {
  const blingBySku = new Map(bling.filter(item => item.sku.trim()).map(item => [key(item.sku), item]));
  const siteBySku = new Map(site.map(item => [key(item.sku), item]));
  const result: Reconciliation = { onlyInBling: [], onlyOnSite: [], stock: [], price: [], summary: { bling: blingBySku.size, site: siteBySku.size, matched: 0, inSync: 0 } };
  for (const [sku, item] of blingBySku) {
    const local = siteBySku.get(sku);
    if (!local) { if (item.active) result.onlyInBling.push(item); continue; }
    result.summary.matched++;
    let ok = true;
    if (item.stock !== local.stock) { ok = false; result.stock.push({ sku: local.sku, name: local.name, bling: item.stock, site: local.stock, reserved: local.reserved, productId: local.productId, variantId: local.variantId }); }
    if (cents(item.price) !== cents(local.price)) { ok = false; result.price.push({ sku: local.sku, name: local.name, bling: item.price, site: local.price }); }
    if (ok) result.summary.inSync++;
  }
  for (const [sku, item] of siteBySku) if (!blingBySku.has(sku) && item.active) result.onlyOnSite.push({ sku: item.sku, name: item.name });
  return result;
}

export type StockPlan = { apply: { productId: string; variantId: string | null; sku: string; from: number; to: number }[]; skipped: { sku: string; reason: string }[] };

/**
 * Decide quais saldos copiar do Bling. Nunca fica abaixo do reservado em pedidos pendentes,
 * e pula SKUs de pedidos que ainda não chegaram ao Bling (o saldo de lá ainda não os considera).
 */
export function planStockSync(diffs: Reconciliation['stock'], pendingSkus: Set<string>): StockPlan {
  const plan: StockPlan = { apply: [], skipped: [] };
  for (const diff of diffs) {
    if (pendingSkus.has(key(diff.sku))) { plan.skipped.push({ sku: diff.sku, reason: 'Há pedido pago ainda não enviado ao Bling' }); continue; }
    const to = Math.max(diff.bling, diff.reserved);
    if (to === diff.site) { plan.skipped.push({ sku: diff.sku, reason: `Bling (${diff.bling}) abaixo do reservado em pedidos pendentes (${diff.reserved})` }); continue; }
    plan.apply.push({ productId: diff.productId, variantId: diff.variantId, sku: diff.sku, from: diff.site, to });
  }
  return plan;
}
