-- Custo de IA por empresa (Gestão Addere): orçamento mensal do agente em
-- tokens e em R$ (só informativo, nada é bloqueado) e o câmbio PTAX do BCB
-- usado para converter o custo, que a Anthropic cobra em dólar.

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "llmMonthlyBudgetBrl" DECIMAL(12,2),
ADD COLUMN     "llmMonthlyTokenBudget" INTEGER;

-- AlterTable
ALTER TABLE "billing_settings" ADD COLUMN     "usdBrlFetchedAt" TIMESTAMP(3),
ADD COLUMN     "usdBrlRate" DECIMAL(10,4),
ADD COLUMN     "usdBrlRateAt" TIMESTAMP(3);
