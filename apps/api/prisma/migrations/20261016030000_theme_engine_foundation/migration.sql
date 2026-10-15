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
CREATE UNIQUE INDEX "ThemeInstallation_id_storeId_key" ON "ThemeInstallation"("id", "storeId");
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
ALTER TABLE "ThemeDraft" ADD CONSTRAINT "ThemeDraft_installationId_storeId_fkey"
  FOREIGN KEY ("installationId", "storeId") REFERENCES "ThemeInstallation"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "ThemeEnginePublication" ADD CONSTRAINT "ThemeEnginePublication_installationId_storeId_fkey"
  FOREIGN KEY ("installationId", "storeId") REFERENCES "ThemeInstallation"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Platform-owned starter release; installing it creates an inactive per-store draft.
INSERT INTO "ThemePackage" ("id", "key", "name", "description", "status", "updatedAt") VALUES ('system-storeos-editorial', 'storeos-editorial', 'StoreOS Editorial', 'Tema inicial responsivo com cabeçalho, banner, categorias, produtos e rodapé.', 'LISTED', CURRENT_TIMESTAMP);
INSERT INTO "ThemeRelease" ("id", "packageId", "version", "manifest", "manifestHash", "status", "publishedAt") VALUES ('system-storeos-editorial-v1', 'system-storeos-editorial', '1.0.0', $json${"id":"storeos-editorial","slug":"storeos-editorial","version":"1.0.0","displayName":"StoreOS Editorial","author":{"name":"STOREOS"},"license":"STOREOS","minRuntimeVersion":"0.1.0","manifestVersion":1,"templates":[{"pageType":"home","title":"home","required":true},{"pageType":"product","title":"product","required":false},{"pageType":"category","title":"category","required":false},{"pageType":"search","title":"search","required":false},{"pageType":"cart","title":"cart","required":false},{"pageType":"page","title":"page","required":false},{"pageType":"blog-index","title":"blog-index","required":false},{"pageType":"blog-post","title":"blog-post","required":false},{"pageType":"landing","title":"landing","required":false},{"pageType":"not-found","title":"not-found","required":false}],"sections":[{"type":"storeos.announcement.v1","title":"Barra de aviso","description":"Barra de aviso","allowedPageTypes":["home","product","category","search","cart","page","blog-index","blog-post","landing","not-found"],"maxBlocks":0,"settingsSchema":{"type":"object","properties":{"text":{"type":"string","title":"Mensagem","maxLength":120},"linkLabel":{"type":"string","title":"Texto do link","maxLength":40},"linkUrl":{"type":"string","title":"Endereço do link","maxLength":500}},"additionalProperties":false},"blockTypes":[]},{"type":"storeos.header.v1","title":"Cabeçalho","description":"Cabeçalho","allowedPageTypes":["home","product","category","search","cart","page","blog-index","blog-post","landing","not-found"],"maxBlocks":0,"settingsSchema":{"type":"object","properties":{"showSearch":{"type":"boolean","title":"Mostrar busca"},"showAccount":{"type":"boolean","title":"Mostrar minha conta"},"showCart":{"type":"boolean","title":"Mostrar carrinho"}},"additionalProperties":false},"blockTypes":[]},{"type":"storeos.hero.v1","title":"Banner principal","description":"Banner principal","allowedPageTypes":["home","landing"],"maxBlocks":0,"settingsSchema":{"type":"object","properties":{"eyebrow":{"type":"string","title":"Chamada curta","maxLength":60},"title":{"type":"string","title":"Título","maxLength":100},"subtitle":{"type":"string","title":"Texto de apoio","maxLength":240},"ctaLabel":{"type":"string","title":"Texto do botão","maxLength":40},"ctaUrl":{"type":"string","title":"Destino do botão","maxLength":500},"imageUrl":{"type":"string","title":"Imagem desktop (URL)","maxLength":500},"mobileImageUrl":{"type":"string","title":"Imagem celular (URL)","maxLength":500}},"additionalProperties":false},"blockTypes":[]},{"type":"storeos.category-grid.v1","title":"Categorias","description":"Categorias","allowedPageTypes":["home","landing"],"maxBlocks":0,"settingsSchema":{"type":"object","properties":{"heading":{"type":"string","title":"Título da seção","maxLength":80},"subheading":{"type":"string","title":"Subtítulo","maxLength":80},"columns":{"type":"integer","title":"Categorias por linha","minimum":2,"maximum":6}},"additionalProperties":false},"blockTypes":[]},{"type":"storeos.product-collection.v1","title":"Vitrine de produtos","description":"Vitrine de produtos","allowedPageTypes":["home","category","search","landing"],"maxBlocks":0,"settingsSchema":{"type":"object","properties":{"heading":{"type":"string","title":"Título da seção","maxLength":80},"subheading":{"type":"string","title":"Subtítulo","maxLength":80},"limit":{"type":"integer","title":"Quantidade de produtos","minimum":1,"maximum":24}},"additionalProperties":false},"blockTypes":[]},{"type":"storeos.footer.v1","title":"Rodapé","description":"Rodapé","allowedPageTypes":["home","product","category","search","cart","page","blog-index","blog-post","landing","not-found"],"maxBlocks":0,"settingsSchema":{"type":"object","properties":{"text":{"type":"string","title":"Texto institucional","maxLength":240},"showNewsletter":{"type":"boolean","title":"Mostrar inscrição de novidades"}},"additionalProperties":false},"blockTypes":[]}],"globalSettingsSchema":{"type":"object","properties":{"showAnnouncement":{"type":"boolean","title":"Mostrar barra de aviso"},"announcementText":{"type":"string","title":"Mensagem da barra de aviso","maxLength":120},"footerNote":{"type":"string","title":"Texto legal do rodapé","maxLength":200}},"additionalProperties":false},"defaultDocument":{"schemaVersion":1,"themeRelease":"storeos-editorial@1.0.0","templates":{"home":{"sections":[{"id":"announcement","type":"storeos.announcement.v1","enabled":true,"settings":{"text":"Frete grátis em compras selecionadas","linkLabel":"Confira","linkUrl":""},"blocks":[]},{"id":"header","type":"storeos.header.v1","enabled":true,"settings":{"showSearch":true,"showAccount":true,"showCart":true},"blocks":[]},{"id":"hero","type":"storeos.hero.v1","enabled":true,"settings":{"eyebrow":"","title":"Sua próxima peça favorita","subtitle":"Descubra novidades escolhidas para você.","ctaLabel":"Ver novidades","ctaUrl":"/categorias","imageUrl":"","mobileImageUrl":""},"blocks":[]},{"id":"categories","type":"storeos.category-grid.v1","enabled":true,"settings":{"heading":"Compre por categoria","subheading":"Encontre o que combina com você.","columns":4},"blocks":[]},{"id":"products","type":"storeos.product-collection.v1","enabled":true,"settings":{"heading":"Destaques da loja","subheading":"Peças selecionadas para você.","limit":8},"blocks":[]},{"id":"footer","type":"storeos.footer.v1","enabled":true,"settings":{"text":"Feito com cuidado para você.","showNewsletter":true},"blocks":[]}]}},"global":{"designTokens":{"colors":{"primary":"#6D28D9","background":"#FFFFFF","text":"#0F172A"},"typography":{"fontFamily":"system"},"spacing":{"section":"48px"},"shape":{"buttonRadius":"12px"}},"settings":{"showAnnouncement":true,"announcementText":"Frete grátis em compras selecionadas","footerNote":""}}},"assets":[]}$json$::jsonb, 'sha256:system-storeos-editorial-v1', 'PUBLISHED', CURRENT_TIMESTAMP);
