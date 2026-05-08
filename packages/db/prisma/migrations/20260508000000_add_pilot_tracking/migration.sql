-- CreateEnum
CREATE TYPE "PilotEventType" AS ENUM ('ORDER_STARTED', 'ORDER_COMPLETED', 'ORDER_SYNCED', 'ORDER_SYNC_FAILED', 'SESSION_STARTED', 'CATALOG_LOADED');

-- CreateEnum
CREATE TYPE "PilotStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "pilots" (
    "id" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "PilotStatus" NOT NULL DEFAULT 'ACTIVE',
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pilots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilot_events" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "repId" TEXT NOT NULL,
    "eventType" "PilotEventType" NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pilot_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pilot_feedbacks" (
    "id" TEXT NOT NULL,
    "pilotId" TEXT NOT NULL,
    "repId" TEXT NOT NULL,
    "orderId" TEXT,
    "rating" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pilot_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pilot_events_pilotId_eventType_occurredAt_idx" ON "pilot_events"("pilotId", "eventType", "occurredAt");

-- AddForeignKey
ALTER TABLE "pilots" ADD CONSTRAINT "pilots_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilot_events" ADD CONSTRAINT "pilot_events_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "pilots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilot_events" ADD CONSTRAINT "pilot_events_repId_fkey" FOREIGN KEY ("repId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilot_feedbacks" ADD CONSTRAINT "pilot_feedbacks_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "pilots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilot_feedbacks" ADD CONSTRAINT "pilot_feedbacks_repId_fkey" FOREIGN KEY ("repId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
