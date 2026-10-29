-- Controle de custo da IA: teto diário por vendedor (padrão 100 mil tokens),
-- último uso do app (a frase do Hoje de madrugada só sai para quem usou no
-- dia útil anterior) e modelo do agente por empresa (null = o do ambiente).
ALTER TABLE "users" ADD COLUMN "lastAppSeenAt" TIMESTAMP(3),
ADD COLUMN "llmDailyTokenCap" INTEGER NOT NULL DEFAULT 100000;

ALTER TABLE "companies" ADD COLUMN "llmModel" TEXT;
