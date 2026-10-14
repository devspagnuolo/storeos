import { Money, money } from '../../shared/money/money';

export type ShippingRuleLike = { id: string; name: string; states: string[]; price: Money; freeAbove: Money | null; minDays: number; maxDays: number };
export type ShippingOption = { id: string; name: string; price: Money; minDays: number; maxDays: number; free: boolean };

/** Regras que atendem a UF (lista vazia = todo o Brasil), com frete grátis acima do valor configurado. */
export function shippingOptions(rules: ShippingRuleLike[], state: string, subtotal: Money): ShippingOption[] {
  return rules
    .filter(rule => rule.states.length === 0 || rule.states.includes(state))
    .map(rule => {
      const free = rule.freeAbove !== null && subtotal.gte(rule.freeAbove);
      return { id: rule.id, name: rule.name, price: free ? money(0) : money(rule.price), minDays: rule.minDays, maxDays: rule.maxDays, free };
    });
}
