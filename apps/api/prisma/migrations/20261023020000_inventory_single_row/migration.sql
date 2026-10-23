-- O índice único (storeId, productId, variantId) não vale quando variantId é nulo (no Postgres, nulos são diferentes),
-- então um produto sem variação poderia ganhar duas linhas de estoque e a reserva do checkout falharia.
-- Se já houver duplicados, a migração não trava o deploy: só avisa, e o índice fica para depois da limpeza.
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "Inventory_storeId_productId_no_variant_key" ON "Inventory" ("storeId", "productId") WHERE "variantId" IS NULL;
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'Estoque com linhas duplicadas para produto sem variação; índice não criado';
END $$;
