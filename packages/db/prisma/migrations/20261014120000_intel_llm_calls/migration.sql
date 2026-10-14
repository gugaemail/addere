-- Registro de chamadas do agente (plano 012): uma linha por geração — sucesso,
-- cache e cada tipo de só-motor —, com os tokens de todas as tentativas.
-- Passa a alimentar o teto diário de tokens e o custo do mês, que liam o cache
-- de texto (expurgado em horas). Tabela nova e vazia; sem texto nem cliente.

-- CreateTable
CREATE TABLE "intel_llm_calls" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "vendorCode" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheCreationTokens" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT,
    "latencyMs" INTEGER,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "intel_llm_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intel_llm_calls_companyId_createdAt_idx" ON "intel_llm_calls"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "intel_llm_calls" ADD CONSTRAINT "intel_llm_calls_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

