-- AlterTable
ALTER TABLE "BlingImport" ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'new',
ADD COLUMN     "skipped" INTEGER NOT NULL DEFAULT 0;
