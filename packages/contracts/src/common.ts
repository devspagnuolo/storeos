import { z } from 'zod';

/** Dinheiro trafega sempre como inteiro em centavos (nunca float). */
export const cents = z.number().int().min(0).max(99_999_999_999);

export const idSchema = z.string().uuid();

export const slugSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug inválido (use letras minúsculas, números e hífens)');

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code: string;
  requestId?: string;
  errors?: { path: string; message: string }[];
}

export const zipCodeSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length === 8, 'CEP deve ter 8 dígitos');

export const addressSchema = z.object({
  recipient: z.string().min(2).max(120),
  zipCode: zipCodeSchema,
  street: z.string().min(2).max(160),
  number: z.string().min(1).max(20),
  complement: z.string().max(80).optional(),
  district: z.string().min(1).max(80),
  city: z.string().min(1).max(80),
  state: z.string().length(2).transform((v) => v.toUpperCase()),
  country: z.string().length(2).default('BR'),
});
export type AddressInput = z.infer<typeof addressSchema>;
