-- AlterTable
ALTER TABLE "BlingConnection" ADD COLUMN "stockSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "stockSyncedAt" TIMESTAMP(3),
ADD COLUMN "stockSyncError" TEXT;
