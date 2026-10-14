const DEVELOPMENT_SECRET = 'unsafe-development-secret-change-me';

/** Em produção a API não sobe sem um segredo forte; em desenvolvimento usa um valor local. */
export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env) {
  const secret = env.JWT_ACCESS_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (env.NODE_ENV === 'production') throw new Error('JWT_ACCESS_SECRET ausente ou com menos de 32 caracteres');
  return secret || DEVELOPMENT_SECRET;
}
