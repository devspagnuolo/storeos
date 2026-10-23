-- Instalação criada pela migração automática do editor clássico: a vitrine mantém o desenho do editor clássico.
ALTER TABLE "ThemeInstallation" ADD COLUMN "classicLook" BOOLEAN NOT NULL DEFAULT false;
