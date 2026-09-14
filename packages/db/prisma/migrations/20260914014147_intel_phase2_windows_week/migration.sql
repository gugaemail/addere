-- CreateEnum
CREATE TYPE "WindowSource" AS ENUM ('CADASTRO', 'SELLER', 'MANAGER');

-- AlterTable
ALTER TABLE "intel_visit_plan_items" ADD COLUMN     "plannedDate" DATE;

-- CreateTable
CREATE TABLE "intel_customer_windows" (
    "id" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "loja" TEXT NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "source" "WindowSource" NOT NULL DEFAULT 'SELLER',
    "changedBy" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intel_customer_windows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "intel_customer_windows_companyId_customerCode_loja_weekday_key" ON "intel_customer_windows"("companyId", "customerCode", "loja", "weekday");

-- AddForeignKey
ALTER TABLE "intel_customer_windows" ADD CONSTRAINT "intel_customer_windows_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
