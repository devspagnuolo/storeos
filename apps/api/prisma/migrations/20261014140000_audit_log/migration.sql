-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "outcome" TEXT NOT NULL,
    "statusCode" INTEGER,
    "ip" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_storeId_createdAt_idx" ON "AuditLog"("storeId", "createdAt" DESC);
CREATE INDEX "AuditLog_storeId_actorId_createdAt_idx" ON "AuditLog"("storeId", "actorId", "createdAt" DESC);
CREATE INDEX "AuditLog_storeId_entity_entityId_idx" ON "AuditLog"("storeId", "entity", "entityId");

-- A trilha é append-only: nenhuma alteração ou remoção, nem pela aplicação.
CREATE FUNCTION "audit_log_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog é imutável (% bloqueado)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_no_update_delete"
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION "audit_log_immutable"();
