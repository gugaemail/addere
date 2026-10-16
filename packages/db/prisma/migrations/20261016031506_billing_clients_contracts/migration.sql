-- Gestão Addere (plano 013): cadastro comercial, catálogo de pacotes,
-- contrato com termos versionados, histórico e regras de cobrança.
-- Só cria tipos e tabelas novas; nenhuma tabela existente é alterada.
-- Dados: os quatro pacotes (preço de tabela em branco: o valor é negociado
-- por cliente) e a linha única de regras, com o bloqueio automático
-- desligado — ele só liga depois do OTA do app (plano 017).

-- CreateEnum
CREATE TYPE "LicenseType" AS ENUM ('STANDARD', 'INTELLIGENCE');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'PENDING_ACCEPTANCE', 'ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContractTermsStatus" AS ENUM ('PROPOSED', 'EFFECTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ContractTermsOrigin" AS ENUM ('CONTRACT', 'AMENDMENT', 'LICENSE_REQUEST');

-- CreateTable
CREATE TABLE "billing_license_packages" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seats" INTEGER,
    "listPriceStandard" DECIMAL(14,2),
    "listPriceIntelligence" DECIMAL(14,2),
    "listExtraSeatPriceStandard" DECIMAL(14,2),
    "listExtraSeatPriceIntelligence" DECIMAL(14,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_license_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_client_profiles" (
    "companyId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "stateRegistration" TEXT,
    "addressStreet" TEXT,
    "addressNumber" TEXT,
    "addressComplement" TEXT,
    "addressDistrict" TEXT,
    "addressCity" TEXT,
    "addressState" TEXT,
    "addressZip" TEXT,
    "legalRepName" TEXT,
    "legalRepCpf" TEXT,
    "legalRepRole" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "billingContactName" TEXT,
    "billingEmail" TEXT,
    "billingPhone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_client_profiles_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "billing_company_contracts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" DATE,
    "graceMonths" INTEGER NOT NULL DEFAULT 0,
    "firstBilledCompetence" DATE,
    "dueDay" INTEGER NOT NULL,
    "overdueBlockDays" INTEGER,
    "seatGuardVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_company_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_contract_terms" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ContractTermsStatus" NOT NULL DEFAULT 'PROPOSED',
    "origin" "ContractTermsOrigin" NOT NULL DEFAULT 'CONTRACT',
    "proposedEffectiveFrom" TIMESTAMP(3),
    "effectiveFrom" TIMESTAMP(3),
    "packageId" TEXT NOT NULL,
    "licenseType" "LicenseType" NOT NULL,
    "includedSeats" INTEGER NOT NULL,
    "extraSeats" INTEGER NOT NULL DEFAULT 0,
    "packagePrice" DECIMAL(14,2) NOT NULL,
    "extraSeatPrice" DECIMAL(14,2) NOT NULL,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_contract_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "companyId" TEXT,
    "actorId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "overdueBlockDays" INTEGER NOT NULL DEFAULT 15,
    "dueReminderDays" INTEGER NOT NULL DEFAULT 3,
    "autoBlockEnabled" BOOLEAN NOT NULL DEFAULT false,
    "notifyEmail" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_license_packages_code_key" ON "billing_license_packages"("code");

-- CreateIndex
CREATE UNIQUE INDEX "billing_company_contracts_companyId_key" ON "billing_company_contracts"("companyId");

-- CreateIndex
CREATE INDEX "billing_contract_terms_contractId_status_idx" ON "billing_contract_terms"("contractId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "billing_contract_terms_contractId_version_key" ON "billing_contract_terms"("contractId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "billing_events_dedupeKey_key" ON "billing_events"("dedupeKey");

-- CreateIndex
CREATE INDEX "billing_events_companyId_createdAt_idx" ON "billing_events"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "billing_client_profiles" ADD CONSTRAINT "billing_client_profiles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_company_contracts" ADD CONSTRAINT "billing_company_contracts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_contract_terms" ADD CONSTRAINT "billing_contract_terms_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "billing_company_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_contract_terms" ADD CONSTRAINT "billing_contract_terms_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "billing_license_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_contract_terms" ADD CONSTRAINT "billing_contract_terms_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Catálogo inicial: 10, 20, 30 e Ilimitado (quantidade digitada no contrato)
INSERT INTO "billing_license_packages" ("id", "code", "name", "seats", "active", "sortOrder", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'P10', 'Pacote 10', 10, true, 10, NOW(), NOW()),
  (gen_random_uuid()::text, 'P20', 'Pacote 20', 20, true, 20, NOW(), NOW()),
  (gen_random_uuid()::text, 'P30', 'Pacote 30', 30, true, 30, NOW(), NOW()),
  (gen_random_uuid()::text, 'UNLIMITED', 'Ilimitado', NULL, true, 40, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

-- Regras globais (linha única)
INSERT INTO "billing_settings" ("id", "overdueBlockDays", "dueReminderDays", "autoBlockEnabled", "updatedAt")
VALUES ('global', 15, 3, false, NOW())
ON CONFLICT ("id") DO NOTHING;
