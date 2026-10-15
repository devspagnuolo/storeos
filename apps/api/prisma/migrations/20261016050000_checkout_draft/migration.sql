-- CreateTable
CREATE TABLE "CheckoutDraft" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "cpf" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutDraft_token_key" ON "CheckoutDraft"("token");

-- CreateIndex
CREATE INDEX "CheckoutDraft_storeId_cpf_idx" ON "CheckoutDraft"("storeId", "cpf");

-- CreateIndex
CREATE INDEX "CheckoutDraft_updatedAt_idx" ON "CheckoutDraft"("updatedAt");

-- AddForeignKey
ALTER TABLE "CheckoutDraft" ADD CONSTRAINT "CheckoutDraft_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
