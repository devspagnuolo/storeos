import { z } from 'zod';
import { slugSchema } from './common';

export const passwordSchema = z
  .string()
  .min(10, 'A senha deve ter ao menos 10 caracteres')
  .max(128)
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v), 'Use letras maiúsculas, minúsculas e números');

export const registerStoreSchema = z.object({
  storeName: z.string().min(2).max(80),
  storeSlug: slugSchema.min(3).max(40),
  ownerName: z.string().min(2).max(120),
  email: z.string().email().toLowerCase(),
  password: passwordSchema,
});
export type RegisterStoreInput = z.infer<typeof registerStoreSchema>;

export const loginSchema = z.object({
  storeSlug: z.string().min(1),
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const mfaVerifySchema = z.object({
  challengeToken: z.string().min(10),
  code: z.string().min(6).max(12),
});

export const refreshSchema = z.object({ refreshToken: z.string().min(20) });
export const mfaConfirmSchema = z.object({ code: z.string().length(6) });
export const mfaDisableSchema = z.object({ password: z.string().min(1), code: z.string().min(6).max(12) });

export const inviteUserSchema = z.object({
  email: z.string().email().toLowerCase(),
  name: z.string().min(2).max(120),
  roleName: z.string().min(1),
});
export const acceptInviteSchema = z.object({ token: z.string().min(20), password: passwordSchema });

export const customerRegisterSchema = z.object({
  storeSlug: z.string().min(1),
  name: z.string().min(2).max(120),
  email: z.string().email().toLowerCase(),
  password: passwordSchema,
  phone: z.string().max(20).optional(),
  acceptsMarketing: z.boolean().default(false),
  acceptedTerms: z.literal(true, { errorMap: () => ({ message: 'É necessário aceitar os termos' }) }),
});
export const customerLoginSchema = z.object({
  storeSlug: z.string().min(1),
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(128),
});

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export type LoginResult =
  | ({ mfaRequired: false } & TokenPair & { user: SessionUser })
  | { mfaRequired: true; challengeToken: string };

export interface SessionUser {
  id: string;
  storeId: string;
  name: string;
  email: string;
  permissions: string[];
  mfaEnabled: boolean;
}
