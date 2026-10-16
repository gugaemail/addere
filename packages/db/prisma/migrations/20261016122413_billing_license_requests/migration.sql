-- Pedidos de licenças adicionais do ADMIN (plano 015): o pedido do
-- administrador indicado, com a declaração aceita, o SHA-256 dela, o IP e o
-- navegador, e a decisão do superadmin; aprovado, aponta para os termos que
-- criou. Cria um tipo e uma tabela nova e vazia; nenhuma tabela existente
-- muda (as relações em companies, users e billing_contract_terms não geram
-- coluna do lado delas).

-- CreateEnum
CREATE TYPE "LicenseRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "billing_license_requests" (
    "id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "message" TEXT,
    "unitPriceShown" DECIMAL(14,2) NOT NULL,
    "declarationText" TEXT NOT NULL,
    "declarationSha256" TEXT NOT NULL,
    "requestedByName" TEXT NOT NULL,
    "requestedByEmail" TEXT NOT NULL,
    "requestedIp" TEXT,
    "requestedUserAgent" TEXT,
    "status" "LicenseRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "resultingTermsId" TEXT,

    CONSTRAINT "billing_license_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_license_requests_resultingTermsId_key" ON "billing_license_requests"("resultingTermsId");

-- CreateIndex
CREATE INDEX "billing_license_requests_companyId_status_idx" ON "billing_license_requests"("companyId", "status");

-- CreateIndex
CREATE INDEX "billing_license_requests_status_createdAt_idx" ON "billing_license_requests"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "billing_license_requests" ADD CONSTRAINT "billing_license_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_license_requests" ADD CONSTRAINT "billing_license_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_license_requests" ADD CONSTRAINT "billing_license_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_license_requests" ADD CONSTRAINT "billing_license_requests_resultingTermsId_fkey" FOREIGN KEY ("resultingTermsId") REFERENCES "billing_contract_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

