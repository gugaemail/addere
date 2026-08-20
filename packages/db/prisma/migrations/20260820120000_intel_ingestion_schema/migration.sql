-- CreateEnum
CREATE TYPE "IntelQueryName" AS ENUM ('CUSTOMERS', 'SALES', 'OPEN_TITLES', 'PRODUCTS', 'STOCK');

-- CreateEnum
CREATE TYPE "IntelQueryScope" AS ENUM ('ALL', 'PER_SELLER');

-- CreateEnum
CREATE TYPE "IntelJob" AS ENUM ('NIGHTLY', 'REFRESH', 'SYNC', 'GOALS', 'ENGINE', 'PLAN', 'GEO', 'PURGE', 'EVAL');

-- CreateEnum
CREATE TYPE "IntelJobRunStatus" AS ENUM ('RUNNING', 'OK', 'ERROR');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "apiSql" TEXT,
ADD COLUMN     "intelligenceConfig" JSONB,
ADD COLUMN     "intelligenceEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "creditLimit" DECIMAL(14,2),
ADD COLUMN     "segment" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "productGroup" TEXT;

-- CreateTable
CREATE TABLE "intel_queries" (
    "id" TEXT NOT NULL,
    "name" "IntelQueryName" NOT NULL,
    "scope" "IntelQueryScope" NOT NULL DEFAULT 'ALL',
    "sql" TEXT NOT NULL,
    "definition" TEXT,
    "exclusions" TEXT,
    "gotchas" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "validatedAt" TIMESTAMP(3),
    "validatedBy" TEXT,
    "reconciliationPeriod" TEXT,
    "reconciliationRefAmount" DECIMAL(14,2),
    "reconciliationCalcAmount" DECIMAL(14,2),
    "reconciliationDiffPct" DECIMAL(6,2),
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intel_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intel_parameters" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "segment" TEXT NOT NULL DEFAULT '',
    "changedBy" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intel_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intel_parameter_history" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "segment" TEXT NOT NULL DEFAULT '',
    "changedBy" TEXT,
    "companyId" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intel_parameter_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intel_sales_items" (
    "companyId" TEXT NOT NULL,
    "orderRef" TEXT NOT NULL,
    "itemSeq" TEXT NOT NULL DEFAULT '00',
    "productCode" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "customerCode" TEXT NOT NULL,
    "loja" TEXT NOT NULL,
    "vendorCode" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "productDesc" TEXT,
    "productGroup" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intel_sales_items_pkey" PRIMARY KEY ("companyId","orderRef","itemSeq","productCode")
);

-- CreateTable
CREATE TABLE "intel_open_titles" (
    "companyId" TEXT NOT NULL,
    "titleRef" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "loja" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL,
    "daysOverdue" INTEGER,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intel_open_titles_pkey" PRIMARY KEY ("companyId","titleRef")
);

-- CreateTable
CREATE TABLE "intel_goal_snapshots" (
    "id" TEXT NOT NULL,
    "vendorCode" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "goalAmount" DECIMAL(14,2),
    "soldAmount" DECIMAL(14,2),
    "goalPositivation" DECIMAL(6,2),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "intel_goal_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intel_job_runs" (
    "id" TEXT NOT NULL,
    "job" "IntelJob" NOT NULL,
    "status" "IntelJobRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "metadata" JSONB,
    "lockedUntil" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,

    CONSTRAINT "intel_job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intel_queries_companyId_name_published_idx" ON "intel_queries"("companyId", "name", "published");

-- CreateIndex
CREATE UNIQUE INDEX "intel_queries_companyId_name_version_key" ON "intel_queries"("companyId", "name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "intel_parameters_companyId_key_segment_key" ON "intel_parameters"("companyId", "key", "segment");

-- CreateIndex
CREATE INDEX "intel_parameter_history_companyId_key_idx" ON "intel_parameter_history"("companyId", "key");

-- CreateIndex
CREATE INDEX "intel_sales_items_companyId_customerCode_loja_date_idx" ON "intel_sales_items"("companyId", "customerCode", "loja", "date");

-- CreateIndex
CREATE INDEX "intel_sales_items_companyId_vendorCode_date_idx" ON "intel_sales_items"("companyId", "vendorCode", "date");

-- CreateIndex
CREATE INDEX "intel_open_titles_companyId_customerCode_loja_idx" ON "intel_open_titles"("companyId", "customerCode", "loja");

-- CreateIndex
CREATE INDEX "intel_goal_snapshots_companyId_vendorCode_period_idx" ON "intel_goal_snapshots"("companyId", "vendorCode", "period");

-- CreateIndex
CREATE INDEX "intel_job_runs_companyId_job_startedAt_idx" ON "intel_job_runs"("companyId", "job", "startedAt");

-- AddForeignKey
ALTER TABLE "intel_queries" ADD CONSTRAINT "intel_queries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intel_parameters" ADD CONSTRAINT "intel_parameters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intel_parameter_history" ADD CONSTRAINT "intel_parameter_history_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intel_sales_items" ADD CONSTRAINT "intel_sales_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intel_open_titles" ADD CONSTRAINT "intel_open_titles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intel_goal_snapshots" ADD CONSTRAINT "intel_goal_snapshots_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intel_job_runs" ADD CONSTRAINT "intel_job_runs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── Data migration: permissões da camada de Inteligência (decisões D3/D3c) ───
-- O seed não roda em produção (render.yaml só faz migrate deploy), então o
-- catálogo entra por migration. Idempotente via ON CONFLICT.
INSERT INTO "permissions" ("id", "key", "label", "category") VALUES
  (gen_random_uuid(), 'intel.admin', 'Inteligência: configurar consultas, premissas e saúde dos dados', 'intelligence'),
  (gen_random_uuid(), 'intel.manager', 'Inteligência: acompanhar equipe em campo e perdas', 'intelligence')
ON CONFLICT ("key") DO NOTHING;

-- intel.admin automático para todo ADMIN existente (D3c); novos ADMINs recebem via createUser
INSERT INTO "user_permissions" ("id", "userId", "permissionId")
SELECT gen_random_uuid(), u."id", p."id"
FROM "users" u
CROSS JOIN "permissions" p
WHERE u."role" = 'ADMIN' AND p."key" = 'intel.admin'
ON CONFLICT ("userId", "permissionId") DO NOTHING;
