-- Camada de Inteligência (E1c): motor, plano do dia e execução.
-- Atenção: o unique users(companyId, idVendProt) falha se houver códigos de
-- vendedor duplicados na mesma empresa — corrigir o cadastro antes do deploy.

-- CreateEnum
CREATE TYPE "Vehicle" AS ENUM ('CAR', 'MOTORCYCLE', 'FOOT');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('NEW', 'ON_CYCLE', 'LATE', 'AT_RISK', 'INACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "SignalConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "PlanKind" AS ENUM ('DAY', 'WEEK');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('GENERATED', 'EDITED', 'IN_PROGRESS', 'CLOSED');

-- CreateEnum
CREATE TYPE "PlanItemOrigin" AS ENUM ('ENGINE', 'MANAGER', 'SELLER');

-- CreateEnum
CREATE TYPE "MessageTemplate" AS ENUM ('STALLED_PROPOSAL', 'WENT_QUIET', 'REACTIVATE');

-- CreateEnum
CREATE TYPE "VisitResult" AS ENUM ('ORDER', 'NO_ORDER', 'NOT_FOUND', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "FeedbackTargetType" AS ENUM ('PLAN', 'ITEM', 'MESSAGE', 'ANSWER');

-- CreateEnum
CREATE TYPE "GeoPrecision" AS ENUM ('ROOFTOP', 'STREET', 'CEP', 'CITY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PilotEventType" ADD VALUE 'PLAN_OPENED';
ALTER TYPE "PilotEventType" ADD VALUE 'VISIT_CHECKIN';
ALTER TYPE "PilotEventType" ADD VALUE 'VISIT_RESULT';
ALTER TYPE "PilotEventType" ADD VALUE 'MESSAGE_SENT';
ALTER TYPE "PilotEventType" ADD VALUE 'PLAN_EDITED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "managerId" TEXT,
ADD COLUMN     "messageTone" TEXT,
ADD COLUMN     "servedCities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "vehicle" "Vehicle",
ADD COLUMN     "visitsPerDay" INTEGER;

-- CreateTable
CREATE TABLE "intel_customer_signals" (
    "companyId" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "loja" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cycleDays" INTEGER,
    "daysSinceLastPurchase" INTEGER,
    "status" "CustomerStatus" NOT NULL,
    "confidence" "SignalConfidence" NOT NULL,
    "orders12m" INTEGER NOT NULL DEFAULT 0,
    "avgTicket" DECIMAL(14,2),
    "trendPct" DECIMAL(6,2),
    "purchaseProb" DECIMAL(4,3),
    "rfmR" INTEGER,
    "rfmF" INTEGER,
    "rfmM" INTEGER,
    "rfmSegment" TEXT,
    "usualMix" JSONB,
    "cutMix" JSONB,
    "crossSell" JSONB,
    "scoreValue" DECIMAL(6,3),
    "scoreUrgency" DECIMAL(6,3),
    "scoreRisk" DECIMAL(6,3),
    "scoreTotal" DECIMAL(6,3),
    "reasons" JSONB,

    CONSTRAINT "intel_customer_signals_pkey" PRIMARY KEY ("companyId","customerCode","loja")
);

-- CreateTable
CREATE TABLE "intel_visit_plans" (
    "id" TEXT NOT NULL,
    "vendorCode" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "PlanKind" NOT NULL DEFAULT 'DAY',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "engineVersion" TEXT,
    "goalGap" DECIMAL(14,2),
    "expectedAmount" DECIMAL(14,2),
    "grouping" TEXT,
    "llmSummary" TEXT,
    "status" "PlanStatus" NOT NULL DEFAULT 'GENERATED',
    "companyId" TEXT NOT NULL,

    CONSTRAINT "intel_visit_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intel_visit_plan_items" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "customerCode" TEXT NOT NULL,
    "loja" TEXT NOT NULL,
    "statusAtTime" "CustomerStatus" NOT NULL,
    "scoreAtTime" DECIMAL(6,3),
    "shortReason" TEXT,
    "suggestedOffer" JSONB,
    "expectedAmount" DECIMAL(14,2),
    "origin" "PlanItemOrigin" NOT NULL DEFAULT 'ENGINE',
    "signalsSnapshot" JSONB,
    "removedAt" TIMESTAMP(3),
    "movedToPlanId" TEXT,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "distFromPrevM" INTEGER,
    "etaMin" INTEGER,
    "plannedTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intel_visit_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intel_visits" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "vendorCode" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "loja" TEXT NOT NULL,
    "planItemId" TEXT,
    "arrivedAt" TIMESTAMP(3) NOT NULL,
    "leftAt" TIMESTAMP(3),
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "accuracyM" INTEGER,
    "result" "VisitResult",
    "noOrderReason" TEXT,
    "orderId" TEXT,
    "notes" TEXT,
    "createdOfflineAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "intel_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intel_customer_messages" (
    "id" TEXT NOT NULL,
    "vendorCode" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "loja" TEXT NOT NULL,
    "template" "MessageTemplate" NOT NULL,
    "text" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "channel" TEXT,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "intel_customer_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intel_feedbacks" (
    "id" TEXT NOT NULL,
    "vendorCode" TEXT NOT NULL,
    "targetType" "FeedbackTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "rating" SMALLINT NOT NULL,
    "comment" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intel_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intel_llm_cache" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "vendorCode" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL DEFAULT '',
    "payload" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "intel_llm_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intel_eval_cases" (
    "id" TEXT NOT NULL,
    "vendorCode" TEXT NOT NULL,
    "frozenDate" DATE NOT NULL,
    "snapshot" JSONB NOT NULL,
    "expected" JSONB NOT NULL,
    "promptVersion" TEXT,
    "lastResult" TEXT,
    "ranAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intel_eval_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intel_geo_addresses" (
    "companyId" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "loja" TEXT NOT NULL,
    "normalizedAddress" TEXT,
    "cep" TEXT,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "precision" "GeoPrecision",
    "source" TEXT,
    "geocodedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "intel_geo_addresses_pkey" PRIMARY KEY ("companyId","customerCode","loja")
);

-- CreateIndex
CREATE INDEX "intel_customer_signals_companyId_status_idx" ON "intel_customer_signals"("companyId", "status");

-- CreateIndex
CREATE INDEX "intel_visit_plans_companyId_date_idx" ON "intel_visit_plans"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "intel_visit_plans_companyId_vendorCode_date_kind_key" ON "intel_visit_plans"("companyId", "vendorCode", "date", "kind");

-- CreateIndex
CREATE INDEX "intel_visit_plan_items_planId_position_idx" ON "intel_visit_plan_items"("planId", "position");

-- CreateIndex
CREATE INDEX "intel_visits_companyId_vendorCode_arrivedAt_idx" ON "intel_visits"("companyId", "vendorCode", "arrivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "intel_visits_companyId_clientId_key" ON "intel_visits"("companyId", "clientId");

-- CreateIndex
CREATE INDEX "intel_customer_messages_companyId_vendorCode_generatedAt_idx" ON "intel_customer_messages"("companyId", "vendorCode", "generatedAt");

-- CreateIndex
CREATE INDEX "intel_feedbacks_companyId_targetType_createdAt_idx" ON "intel_feedbacks"("companyId", "targetType", "createdAt");

-- CreateIndex
CREATE INDEX "intel_llm_cache_companyId_expiresAt_idx" ON "intel_llm_cache"("companyId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "intel_llm_cache_companyId_kind_vendorCode_targetKey_key" ON "intel_llm_cache"("companyId", "kind", "vendorCode", "targetKey");

-- CreateIndex
CREATE INDEX "intel_eval_cases_companyId_idx" ON "intel_eval_cases"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "users_companyId_idVendProt_key" ON "users"("companyId", "idVendProt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intel_customer_signals" ADD CONSTRAINT "intel_customer_signals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intel_visit_plans" ADD CONSTRAINT "intel_visit_plans_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intel_visit_plan_items" ADD CONSTRAINT "intel_visit_plan_items_planId_fkey" FOREIGN KEY ("planId") REFERENCES "intel_visit_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intel_visits" ADD CONSTRAINT "intel_visits_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intel_customer_messages" ADD CONSTRAINT "intel_customer_messages_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intel_feedbacks" ADD CONSTRAINT "intel_feedbacks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intel_llm_cache" ADD CONSTRAINT "intel_llm_cache_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intel_eval_cases" ADD CONSTRAINT "intel_eval_cases_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intel_geo_addresses" ADD CONSTRAINT "intel_geo_addresses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

