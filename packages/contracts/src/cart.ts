import { z } from 'zod';
import { zipCodeSchema } from './common';

export const addCartItemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(999),
});
export const updateCartItemSchema = z.object({ quantity: z.number().int().min(0).max(999) });
export const applyCouponSchema = z.object({ code: z.string().min(2).max(40) });
export const shippingQuoteSchema = z.object({ zipCode: zipCodeSchema });
export const cartIdentitySchema = z.object({ email: z.string().email().optional() });

export interface CartLineView {
  itemId: string;
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  variantName: string | null;
  sku: string;
  imageUrl: string | null;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  totalCents: number;
  available: number;
}

export interface CartTotals {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  cashbackAppliedCents: number;
  totalCents: number;
}

export interface CartView {
  token: string;
  currency: string;
  items: CartLineView[];
  totals: CartTotals;
  couponCode: string | null;
  couponMessage: string | null;
  appliedPromotions: { name: string; discountCents: number }[];
  freeShippingRemainingCents: number | null;
  upsell: { variantId: string; productId: string; slug: string; name: string; priceCents: number; imageUrl: string | null }[];
  warnings: string[];
}

export interface ShippingOption {
  id: string;
  provider: string;
  serviceCode: string | null;
  name: string;
  priceCents: number;
  estimatedDays: number;
}
