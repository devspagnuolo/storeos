-- Rascunhos de temas só ficam guardados quando a lojista pede ("Guardar rascunho").
ALTER TABLE "ThemeInstallation" ADD COLUMN "savedAt" TIMESTAMP(3);

-- Limpeza dos rascunhos acumulados: temas fora do ar saem da lista (status REMOVED) e os rascunhos ficam arquivados.
-- Nada é apagado: publicações continuam no histórico e "Trazer de volta como rascunho" reabre o tema.
UPDATE "ThemeDraft" SET "status" = 'ARCHIVED'
WHERE "status" = 'DRAFT' AND "installationId" IN (SELECT "id" FROM "ThemeInstallation" WHERE "status" = 'INACTIVE');
UPDATE "ThemeInstallation" SET "status" = 'REMOVED' WHERE "status" = 'INACTIVE';
