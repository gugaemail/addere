-- Bloqueio de acesso da empresa (plano 017): por atraso (OVERDUE), só depois do
-- aviso de suspensão com 10 dias corridos. MANUAL fica reservado e desabilitado
-- (decisão de 15/10/2026): nenhum código o grava. O bloqueio é por rota e não
-- apaga dado nenhum. Colunas novas e nulas: toda empresa existente nasce
-- liberada.

-- CreateEnum
CREATE TYPE "AccessBlockReason" AS ENUM ('OVERDUE', 'MANUAL');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "accessBlockReason" "AccessBlockReason",
ADD COLUMN     "accessBlockedAt" TIMESTAMP(3),
ADD COLUMN     "blockExemptUntil" DATE;
