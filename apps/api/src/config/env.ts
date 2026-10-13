import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3001),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),
  REDIS_URL: z.string().optional(),
  RABBITMQ_URL: z.string().optional(),
  MEILI_URL: z.string().url().optional(),
  MEILI_MASTER_KEY: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET precisa de ao menos 32 caracteres'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  /** 32 bytes em base64 (AES-256-GCM) — use KMS/secret manager em produção. */
  ENCRYPTION_KEY: z.string().min(40, 'ENCRYPTION_KEY deve ser 32 bytes em base64'),

  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  PUBLIC_API_URL: z.string().default('http://localhost:3001'),
  SWAGGER_ENABLED: bool.default('true'),
  OUTBOX_RELAY_ENABLED: bool.default('true'),
  SYNC_WORKER_ENABLED: bool.default('true'),
  THROTTLE_LIMIT: z.coerce.number().int().default(240),

  PAYMENT_PROVIDER: z.string().default('mock'),
  MERCADOPAGO_ACCESS_TOKEN: z.string().optional(),
  MELHOR_ENVIO_TOKEN: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-sonnet-4-5'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuração de ambiente inválida:\n${details}`);
  }
  return parsed.data;
}
