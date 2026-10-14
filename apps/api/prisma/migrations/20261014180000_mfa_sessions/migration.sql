-- MFA (TOTP) e metadados de sessão. Só adiciona colunas; nenhum dado existente é alterado.
ALTER TABLE "User" ADD COLUMN "mfaSecretEnc" TEXT, ADD COLUMN "mfaRecovery" TEXT[] DEFAULT ARRAY[]::TEXT[], ADD COLUMN "mfaLastStep" INTEGER;
ALTER TABLE "RefreshToken" ADD COLUMN "userAgent" TEXT, ADD COLUMN "ip" TEXT, ADD COLUMN "lastUsedAt" TIMESTAMP(3);
