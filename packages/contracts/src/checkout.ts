import { z } from 'zod';
import { addressSchema } from './common';

export const paymentMethodSchema = z.enum(['PIX', 'CREDIT_CARD', 'BOLETO']);

export const cpfCnpjSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length === 11 || v.length === 14, 'Documento deve ser CPF (11) ou CNPJ (14)');

export const checkoutSchema = z.object({
  cartToken: z.string().min(10),
  customer: z.object({
    name: z.string().min(2).max(120),
    email: z.string().email().toLowerCase(),
    phone: z.string().min(8).max(20),
    document: cpfCnpjSchema,
  }),
  shippingAddress: addressSchema,
  billingAddress: addressSchema.optional(),
  shippingOptionId: z.string().min(1),
  payment: z.object({
    method: paymentMethodSchema,
    installments: z.number().int().min(1).max(12).default(1),
    /** Token gerado pelo SDK do provedor no navegador; nunca dados brutos de cartão. */
    cardToken: z.string().min(8).optional(),
    /** Bandeira/ID do meio de pagamento retornado pelo SDK (ex.: visa, master). */
    cardPaymentMethodId: z.string().max(40).optional(),
    cardHolderName: z.string().max(120).optional(),
  }),
  useCashbackCents: z.number().int().min(0).default(0),
  referralCode: z.string().max(20).optional(),
  acceptedTerms: z.literal(true, { errorMap: () => ({ message: 'É necessário aceitar os termos' }) }),
  acceptsMarketing: z.boolean().default(false),
  notes: z.string().max(500).optional(),
  utm: z.record(z.string()).optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export interface PaymentInstructions {
  paymentId: string;
  method: 'PIX' | 'CREDIT_CARD' | 'BOLETO';
  status: string;
  pixQrCode?: string | null;
  pixCopyPaste?: string | null;
  boletoUrl?: string | null;
  boletoBarcode?: string | null;
  expiresAt?: string | null;
}

export interface CheckoutResult {
  orderId: string;
  orderNumber: string;
  status: string;
  totalCents: number;
  trackingToken: string;
  payment: PaymentInstructions;
}
