-- Theme Engine foundation. Existing storefront JSON/publications are intentionally untouched.
CREATE TYPE "ThemePackageStatus" AS ENUM ('DRAFT', 'LISTED', 'DEPRECATED');
CREATE TYPE "ThemeReleaseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DEPRECATED');
CREATE TYPE "ThemeInstallationStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'REMOVED');
CREATE TYPE "ThemeDraftStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "ThemePackage" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "ThemePackageStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ThemePackage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ThemePackage_key_key" ON "ThemePackage"("key");

CREATE TABLE "ThemeRelease" (
  "id" TEXT NOT NULL,
  "packageId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "manifest" JSONB NOT NULL,
  "manifestHash" TEXT NOT NULL,
  "status" "ThemeReleaseStatus" NOT NULL DEFAULT 'DRAFT',
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ThemeRelease_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ThemeRelease_packageId_version_key" ON "ThemeRelease"("packageId", "version");
CREATE INDEX "ThemeRelease_packageId_status_idx" ON "ThemeRelease"("packageId", "status");
ALTER TABLE "ThemeRelease" ADD CONSTRAINT "ThemeRelease_packageId_fkey"
  FOREIGN KEY ("packageId") REFERENCES "ThemePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ThemeInstallation" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "releaseId" TEXT NOT NULL,
  "status" "ThemeInstallationStatus" NOT NULL DEFAULT 'INACTIVE',
  "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ThemeInstallation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ThemeInstallation_storeId_releaseId_key" ON "ThemeInstallation"("storeId", "releaseId");
CREATE INDEX "ThemeInstallation_storeId_status_idx" ON "ThemeInstallation"("storeId", "status");
ALTER TABLE "ThemeInstallation" ADD CONSTRAINT "ThemeInstallation_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ThemeInstallation" ADD CONSTRAINT "ThemeInstallation_releaseId_fkey"
  FOREIGN KEY ("releaseId") REFERENCES "ThemeRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ThemeDraft" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "installationId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "document" JSONB NOT NULL,
  "status" "ThemeDraftStatus" NOT NULL DEFAULT 'DRAFT',
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ThemeDraft_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ThemeDraft_storeId_installationId_updatedAt_idx" ON "ThemeDraft"("storeId", "installationId", "updatedAt");
ALTER TABLE "ThemeDraft" ADD CONSTRAINT "ThemeDraft_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ThemeDraft" ADD CONSTRAINT "ThemeDraft_installationId_fkey"
  FOREIGN KEY ("installationId") REFERENCES "ThemeInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ThemeEnginePublication" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "installationId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "document" JSONB NOT NULL,
  "documentHash" TEXT NOT NULL,
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ThemeEnginePublication_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ThemeEnginePublication_storeId_version_key" ON "ThemeEnginePublication"("storeId", "version");
CREATE INDEX "ThemeEnginePublication_storeId_createdAt_idx" ON "ThemeEnginePublication"("storeId", "createdAt");
ALTER TABLE "ThemeEnginePublication" ADD CONSTRAINT "ThemeEnginePublication_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ThemeEnginePublication" ADD CONSTRAINT "ThemeEnginePublication_installationId_fkey"
  FOREIGN KEY ("installationId") REFERENCES "ThemeInstallation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
