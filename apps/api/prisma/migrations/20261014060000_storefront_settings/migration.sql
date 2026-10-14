ALTER TABLE "Store"
ADD COLUMN "themeConfig" JSONB NOT NULL DEFAULT '{}'::jsonb;
