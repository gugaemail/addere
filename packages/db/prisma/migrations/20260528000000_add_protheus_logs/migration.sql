-- CreateTable
CREATE TABLE "protheus_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "endpointKey" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "httpStatus" INTEGER,
    "durationMs" INTEGER,
    "recordsSynced" INTEGER,
    "totalRecords" INTEGER,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "protheus_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "protheus_logs_companyId_createdAt_idx" ON "protheus_logs"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "protheus_logs_companyId_operation_success_idx" ON "protheus_logs"("companyId", "operation", "success");

-- AddForeignKey
ALTER TABLE "protheus_logs" ADD CONSTRAINT "protheus_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
